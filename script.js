// Mobile nav toggle
const toggle = () => {
  const btn = document.querySelector(".nav-toggle");
  const links = document.querySelector(".nav-links");
  if (!btn || !links) return;
  btn.addEventListener("click", () => {
    const open = links.style.display === "flex";
    links.style.display = open ? "none" : "flex";
  });
};

const setupNavDropdowns = () => {
  const dropdowns = Array.from(document.querySelectorAll(".nav-dropdown"));
  if (dropdowns.length === 0) return;

  const closeAll = () => {
    dropdowns.forEach((dropdown) => {
      const toggleBtn = dropdown.querySelector(".nav-drop-toggle");
      dropdown.classList.remove("open");
      if (toggleBtn) toggleBtn.setAttribute("aria-expanded", "false");
    });
  };

  dropdowns.forEach((dropdown) => {
    const toggleBtn = dropdown.querySelector(".nav-drop-toggle");
    if (!toggleBtn) return;

    toggleBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      const isOpen = dropdown.classList.contains("open");
      closeAll();
      if (!isOpen) {
        dropdown.classList.add("open");
        toggleBtn.setAttribute("aria-expanded", "true");
      }
    });
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".nav-dropdown")) closeAll();
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 720) closeAll();
  });
};

const setupContactToggle = () => {
  const button = document.getElementById("contact-toggle");
  const panel = document.getElementById("organizer-contact");
  if (!button || !panel) return;

  button.addEventListener("click", () => {
    const isOpen = panel.style.display === "block";
    panel.style.display = isOpen ? "none" : "block";
    button.textContent = isOpen ? "Contact Us" : "Hide Contact Details";
  });
};

const setupAdminLoginButton = () => {
  const navCta = document.querySelector(".nav-cta");
  if (!navCta || navCta.querySelector("[data-admin-login='true']")) return;

  const inPagesDir = window.location.pathname.includes("/pages/");
  const loginHref = inPagesDir ? "admin-login.html" : "pages/admin-login.html";

  const loginBtn = document.createElement("a");
  loginBtn.href = loginHref;
  loginBtn.className = "btn btn-outline";
  loginBtn.textContent = "LOG IN";
  loginBtn.setAttribute("data-admin-login", "true");

  const crest = navCta.querySelector(".crest");
  if (crest) {
    navCta.insertBefore(loginBtn, crest);
  } else {
    navCta.appendChild(loginBtn);
  }
};

document.addEventListener("DOMContentLoaded", () => {
  toggle();
  setupNavDropdowns();
  setupContactToggle();
  setupAdminLoginButton();
});
