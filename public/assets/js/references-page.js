// public/assets/js/references-page.js
const fitPanels = () => {
  const header = document.getElementById('site-header');
  const legal = document.querySelector('.legal-links');
  const board = document.querySelector('.ref-board');
  if (!board) return;

  const vh = window.innerHeight;
  const headerH = header ? header.offsetHeight : 64;
  const legalH = legal ? legal.offsetHeight : 32;
  const outerMargins = 64; // breathing room above/below main
  const gapY = 16;         // grid row gap
  const panelTitleH = 40;  // approximate per panel title area

  // We have two rows of panels. Work out what each scroll body can have.
  const availableForBoards = vh - headerH - legalH - outerMargins;
  const perRow = (availableForBoards - gapY) / 2; // two rows
  const bodyMax = Math.max(180, Math.floor(perRow - panelTitleH - 24)); // padding

  document.querySelectorAll('.ref-panel__body').forEach(b => {
    b.style.maxHeight = `${bodyMax}px`;
  });
};

window.addEventListener('resize', fitPanels);
document.addEventListener('DOMContentLoaded', fitPanels);


