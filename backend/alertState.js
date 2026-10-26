'use strict';
const risk = require('./riskModel');
const CONFIRM_UP = 2;
const CONFIRM_DOWN = 2;
function newPairState() { return { level: 'NONE', upCount: 0, upMin: 0, downCount: 0, downMax: 0 }; }

function stepPair(ps, rawLevel) {
  const r = risk.RANK[rawLevel];
  const cur = risk.RANK[ps.level];
  if (r > cur) {
    ps.downCount = 0;
    ps.upCount += 1;
    ps.upMin = ps.upCount === 1 ? r : Math.min(ps.upMin, r);
    if (ps.upCount >= CONFIRM_UP) { ps.level = risk.LEVELS[ps.upMin]; ps.upCount = 0; }
  } else if (r < cur) {
    ps.upCount = 0;
    ps.downCount += 1;
    ps.downMax = ps.downCount === 1 ? r : Math.max(ps.downMax, r);
    if (ps.downCount >= CONFIRM_DOWN) { ps.level = risk.LEVELS[ps.downMax]; ps.downCount = 0; }
  } else {
    ps.upCount = 0;
    ps.downCount = 0;
  }
}

module.exports = { newPairState, stepPair };
