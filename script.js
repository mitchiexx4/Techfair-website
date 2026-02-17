// Mobile nav toggle
const toggle = () => {
  const btn = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if(!btn || !links) return;
  btn.addEventListener('click', () => {
    const open = links.style.display === 'flex';
    links.style.display = open ? 'none' : 'flex';
  });
};

document.addEventListener('DOMContentLoaded', () => {
  toggle();
});
