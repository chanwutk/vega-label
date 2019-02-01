/*eslint no-console: "warn"*/
/*eslint no-empty: "warn"*/
/*eslint no-unused-vars: "warn"*/
import LabelPlacer from './LabelPlacers/LabelPlacer';
import AreaLabelPlacer from './LabelPlacers/AreaLabelPlacer';
import {default as BitMap, printBitMap, prepareBitmap} from './BitMap';

// 8-bit representation of anchors
const TOP = 0x0,
  MIDDLE = 0x1 << 0x2,
  BOTTOM = 0x2 << 0x2,
  LEFT = 0x0,
  CENTER = 0x1,
  RIGHT = 0x2;

// Dictionary mapping from text anchor to its number representation
const anchorTextToNumber = {
  'top-left': TOP + LEFT,
  top: TOP + CENTER,
  'top-right': TOP + RIGHT,
  left: MIDDLE + LEFT,
  middle: MIDDLE + CENTER,
  right: MIDDLE + RIGHT,
  'bottom-left': BOTTOM + LEFT,
  bottom: BOTTOM + CENTER,
  'bottom-right': BOTTOM + RIGHT
};

export default function() {
  let offsets, sort, anchors, avoidMarks, size;
  let avoidBaseMark, lineAnchor, markIdx, padding;
  let label = {},
    texts = [];

  label.layout = function() {
    const n = texts.length;
    if (!n) return texts; // return immediately when there is not a label to be placed

    if (!size || size.length !== 2) {
      throw Error('Size of chart should be specified as an array of width and height');
    }

    const data = new Array(n),
      marktype = texts[0].datum && texts[0].datum.mark ? texts[0].datum.mark.marktype : undefined,
      transformed = texts[0].transformed,
      grouptype = marktype === 'group' ? texts[0].datum.items[markIdx].marktype : undefined,
      getMarkBoundary = getMarkBoundaryFactory(marktype, grouptype, lineAnchor, markIdx);

    // prepare text mark data for placing
    for (let i = 0; i < n; i++) {
      const d = texts[i];

      data[i] = {
        textWidth: undefined,
        textHeight: d.fontSize,
        fontSize: d.fontSize,
        font: d.font,
        text: d.text,
        sort: sort ? sort(d.datum) : undefined,
        markBound: getMarkBoundary(d),
        originalOpacity: transformed ? d.originalOpacity : d.opacity,
        opacity: 0,
        datum: d
      };
    }

    // sort field has to be primitive variable type
    if (sort) data.sort((a, b) => a.sort - b.sort);

    // a flag for determining if it is possible for label to be placed inside its base mark
    let labelInside = false;
    for (let i = 0; i < anchors.length && !labelInside; i++) {
      // label inside if anchor is at center
      // label inside if offset to be inside the mark bound
      labelInside |= anchors[i] === 0x5 || offsets[i] < 0;
    }

    const bitmaps = prepareBitmap(data, size, marktype, avoidBaseMark, avoidMarks, labelInside, padding);
    if (grouptype === 'area') {
      // area chart need another bitmap to find the shape of each area
      bitmaps.push(new BitMap(size[0], size[1], padding));
    }

    const labelPlacer =
      grouptype === 'area'
        ? new AreaLabelPlacer(bitmaps, size, avoidBaseMark)
        : new LabelPlacer(bitmaps, size, anchors, offsets);

    // place all label
    for (let i = 0; i < n; i++) {
      const d = data[i];
      if (d.originalOpacity !== 0 && labelPlacer.place(d)) {
        d.opacity = d.originalOpacity;
      }
    }

    // printBitMap(bitmaps[0], 'bit-map-0');
    // if (bitmaps[1]) printBitMap(bitmaps[1], 'bit-map-1');
    // if (bitmaps.length >= 3 && bitmaps[2]) printBitMap(bitmaps[2], 'bit-map-2');
    return data;
  };

  label.texts = function(_) {
    if (arguments.length) {
      texts = _;
      return label;
    } else return texts;
  };

  label.offset = function(_, len) {
    if (arguments.length) {
      const n = _.length;
      offsets = new Float64Array(len);
      for (let i = 0; i < n; i++) offsets[i] = _[i] ? _[i] : 0;
      for (let i = n; i < len; i++) offsets[i] = offsets[n - 1] ? offsets[n - 1] : 0;
      return label;
    } else return offsets;
  };

  label.anchor = function(_, len) {
    if (arguments.length) {
      const n = _.length;
      anchors = new Int8Array(len);
      for (let i = 0; i < n; i++) anchors[i] |= anchorTextToNumber[_[i]];
      for (let i = n; i < len; i++) anchors[i] = anchors[n - 1];
      return label;
    } else return anchors;
  };

  label.sort = function(_) {
    if (arguments.length) {
      sort = _;
      return label;
    } else return sort;
  };

  label.avoidMarks = function(_) {
    if (arguments.length) {
      avoidMarks = _;
      return label;
    } else return sort;
  };

  label.size = function(_) {
    if (arguments.length) {
      size = _;
      return label;
    } else return size;
  };

  label.avoidBaseMark = function(_) {
    if (arguments.length) {
      avoidBaseMark = _;
      return label;
    } else return avoidBaseMark;
  };

  label.lineAnchor = function(_) {
    if (arguments.length) {
      lineAnchor = _;
      return label;
    } else return lineAnchor;
  };

  label.markIdx = function(_) {
    if (arguments.length) {
      markIdx = _;
      return label;
    } else return markIdx;
  };

  label.padding = function(_) {
    if (arguments.length) {
      padding = _;
      return label;
    } else return padding;
  };

  return label;
}

/**
 * Factory function for function for getting base mark boundary, depending on mark and group type.
 * When mark type is undefined, line or area: boundary is the coordinate of each data point.
 * When base mark is grouped line, boundary is either at the beginning or end of the line depending
 * on the value of lineAnchor.
 * Otherwise, use boundary of base mark.
 *
 * @param {string} marktype mark type of base mark (marktype can be undefined if label does not use
 *                          reactive geometry to any other mark)
 * @param {string} grouptype group type of base mark if mark type is 'group' (grouptype can be
 *                           undefined if the base mark is not in group)
 * @param {string} lineAnchor anchor point of group line mark if group type is 'line' can be either
 *                            'begin' or 'end'
 * @param {number} markIdx index of base mark if base mark is in a group with multiple marks
 *
 * @returns function(d) for getting mark boundary from data point information d
 */
function getMarkBoundaryFactory(marktype, grouptype, lineAnchor, markIdx) {
  if (!marktype) {
    // no reactive geometry
    return d => [d.x, d.x, d.x, d.y, d.y, d.y];
  } else if (marktype === 'line' || marktype === 'area') {
    return function(d) {
      const datum = d.datum;
      return [datum.x, datum.x, datum.x, datum.y, datum.y, datum.y];
    };
  } else if (grouptype === 'line') {
    const endItemIndex = lineAnchor === 'begin' ? m => m - 1 : () => 0;
    return function(d) {
      const items = d.datum.items[markIdx].items;
      const m = items.length;
      if (m) {
        // this line has at least 1 item
        const endItem = items[endItemIndex(m)];
        return [endItem.x, endItem.x, endItem.x, endItem.y, endItem.y, endItem.y];
      } else {
        // empty line
        const minInt = Number.MIN_SAFE_INTEGER;
        return [minInt, minInt, minInt, minInt, minInt, minInt];
      }
    };
  } else {
    return function(d) {
      const b = d.datum.bounds;
      return [b.x1, (b.x1 + b.x2) / 2.0, b.x2, b.y1, (b.y1 + b.y2) / 2.0, b.y2];
    };
  }
}
