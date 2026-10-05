// Points for one placement.
//   cells placed        1 point each
//   lines cleared       10, 30, 60, 100 ... for 1, 2, 3, 4 lines at once
//   combo               line points x (1 + 0.5 per combo step), combo grows
//                       with each clearing move and survives up to
//                       COMBO_GRACE moves without a clear
//   board wiped clean   +300
export const COMBO_GRACE = 3;
export const COMBO_CAP = 8;
export const BOARD_CLEAR_BONUS = 300;

export function linePoints(lines) {
  return (10 * lines * (lines + 1)) / 2;
}

export function scorePlacement({ cells, lines, combo, boardCleared }) {
  const comboFactor = 1 + 0.5 * Math.min(combo, COMBO_CAP);
  return cells + Math.round(linePoints(lines) * comboFactor) + (boardCleared ? BOARD_CLEAR_BONUS : 0);
}
