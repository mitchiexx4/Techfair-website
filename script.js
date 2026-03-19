const MOBILE_NAV_BREAKPOINT = 1080;

// Mobile nav toggle
const toggle = () => {
  const btn = document.querySelector(".nav-toggle");
  const links = document.querySelector(".nav-links");
  if (!btn || !links) return;

  const closeMenu = () => {
    links.classList.remove("open");
    btn.setAttribute("aria-expanded", "false");
  };

  btn.addEventListener("click", () => {
    const open = links.classList.toggle("open");
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  });

  links.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMenu);
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > MOBILE_NAV_BREAKPOINT) {
      links.classList.remove("open");
      btn.setAttribute("aria-expanded", "false");
      links.style.display = "";
    }
  });
};

const setupNavDropdowns = () => {
  const dropdowns = Array.from(document.querySelectorAll(".nav-dropdown"));
  if (dropdowns.length === 0) return;

  const floatingMenu = document.createElement("div");
  floatingMenu.className = "desktop-floating-menu";
  document.body.appendChild(floatingMenu);

  const closeAll = () => {
    dropdowns.forEach((dropdown) => {
      const toggleBtn = dropdown.querySelector(".nav-drop-toggle");
      dropdown.classList.remove("open");
      if (toggleBtn) toggleBtn.setAttribute("aria-expanded", "false");
    });
    floatingMenu.classList.remove("open");
    floatingMenu.innerHTML = "";
    delete floatingMenu.dataset.owner;
  };

  dropdowns.forEach((dropdown) => {
    const toggleBtn = dropdown.querySelector(".nav-drop-toggle");
    const menu = dropdown.querySelector(".nav-dropdown-menu");
    if (!toggleBtn) return;

    dropdown.querySelectorAll(".nav-dropdown-menu a").forEach((link) => {
      link.addEventListener("click", (event) => {
        event.stopPropagation();
        const href = link.getAttribute("href");
        closeAll();
        if (href) {
          window.location.assign(href);
        }
      });
    });

    toggleBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      const isOpen = dropdown.classList.contains("open");
      closeAll();
      if (!isOpen) {
        if (window.innerWidth > MOBILE_NAV_BREAKPOINT && menu) {
          const rect = toggleBtn.getBoundingClientRect();
          floatingMenu.innerHTML = menu.innerHTML;
          floatingMenu.classList.add("open");
          floatingMenu.dataset.owner = dropdown.querySelector(".nav-drop-toggle")?.textContent?.trim() || "";

          const menuWidth = Math.max(260, floatingMenu.offsetWidth || 260);
          const left = Math.min(
            Math.max(16, rect.left),
            Math.max(16, window.innerWidth - menuWidth - 16)
          );

          floatingMenu.style.top = `${Math.round(rect.bottom + 10)}px`;
          floatingMenu.style.left = `${Math.round(left)}px`;

          floatingMenu.querySelectorAll("a").forEach((link) => {
            link.addEventListener("click", (linkEvent) => {
              linkEvent.preventDefault();
              const href = link.getAttribute("href");
              closeAll();
              if (href) window.location.assign(href);
            });
          });
        } else {
          dropdown.classList.add("open");
          toggleBtn.setAttribute("aria-expanded", "true");
        }
      }
    });
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".nav-dropdown") && !event.target.closest(".nav-dropdown-menu") && !event.target.closest(".desktop-floating-menu")) closeAll();
  });

  window.addEventListener("resize", () => {
    closeAll();
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

const getAdminLoginHref = () => {
  const inPagesDir = window.location.pathname.includes("/pages/");
  return inPagesDir ? "admin-login.html" : "pages/admin-login.html";
};

const setupLogoMenu = () => {
  const navCta = document.querySelector(".nav-cta");
  const crest = navCta?.querySelector(".crest");
  if (!navCta || !crest || navCta.querySelector(".logo-menu")) return;

  const loginHref = getAdminLoginHref();
  const logoImg = crest.querySelector("img");

  const menuWrap = document.createElement("div");
  menuWrap.className = "logo-menu";

  const menuToggle = document.createElement("button");
  menuToggle.type = "button";
  menuToggle.className = "crest logo-menu-toggle";
  menuToggle.setAttribute("aria-label", "Open logo menu");
  menuToggle.setAttribute("aria-haspopup", "true");
  menuToggle.setAttribute("aria-expanded", "false");
  if (logoImg) {
    menuToggle.appendChild(logoImg.cloneNode(true));
  }

  const menu = document.createElement("div");
  menu.className = "logo-dropdown";

  const loginLink = document.createElement("a");
  loginLink.href = loginHref;
  loginLink.textContent = "LOG IN";
  loginLink.setAttribute("data-admin-login", "true");
  loginLink.setAttribute("role", "menuitem");
  loginLink.tabIndex = 0;

  menu.appendChild(loginLink);
  menuWrap.appendChild(menuToggle);
  menuWrap.appendChild(menu);
  crest.replaceWith(menuWrap);

  const closeMenu = () => {
    menuWrap.classList.remove("open");
    menuToggle.setAttribute("aria-expanded", "false");
  };

  menuToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = menuWrap.classList.toggle("open");
    menuToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  });

  loginLink.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });

  loginLink.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeMenu();
    window.location.assign(loginHref);
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".logo-menu")) closeMenu();
  });
};

const setupBrandLogos = () => {
  const brand = document.querySelector(".brand");
  if (!brand || brand.querySelector(".brand-logos")) return;

  const inPagesDir = window.location.pathname.includes("/pages/");
  const assetBase = inPagesDir ? "../assets" : "assets";
  const existingMenu = document.querySelector(".nav-cta .logo-menu, .nav-cta .crest");

  const copy = document.createElement("div");
  copy.className = "brand-copy";
  while (brand.firstChild) {
    copy.appendChild(brand.firstChild);
  }

  const logos = document.createElement("div");
  logos.className = "brand-logos";

  [
    { src: `${assetBase}/TECHFAIR Logo.jpeg`, alt: "GIMPA Tech Fair logo" },
    { src: `${assetBase}/SOTSS LOGO.png`, alt: "SOTSS logo" }
  ].forEach((item) => {
    const img = document.createElement("img");
    img.className = "brand-logo-image";
    img.src = item.src;
    img.alt = item.alt;
    logos.appendChild(img);
  });

  if (existingMenu) {
    logos.appendChild(existingMenu);
  }

  brand.appendChild(logos);
  brand.appendChild(copy);
};

const setupSharedSiteInfo = () => {
  const footerColumns = Array.from(document.querySelectorAll(".site-footer .footer-grid > div"));
  const brandColumn = footerColumns[0];
  const contactColumn = footerColumns.find((col) => col.querySelector("h4")?.textContent.trim() === "Contact");
  const followColumn = footerColumns.find((col) => col.querySelector("h4")?.textContent.trim() === "Follow Us");
  const organizerContact = document.getElementById("organizer-contact");
  const footerBottom = document.querySelector(".site-footer .footer-bottom");
  const loginHref = getAdminLoginHref();
  const inPagesDir = window.location.pathname.includes("/pages/");
  const policyBase = inPagesDir ? "" : "pages/";

  if (brandColumn) {
    const existingLogin = brandColumn.querySelector("[data-footer-admin-login='true']");
    if (!existingLogin) {
      const loginLink = document.createElement("a");
      loginLink.href = loginHref;
      loginLink.className = "footer-admin-login";
      loginLink.textContent = "Admin Login";
      loginLink.setAttribute("data-footer-admin-login", "true");
      brandColumn.appendChild(loginLink);
    }
  }

  if (contactColumn) {
    contactColumn.innerHTML = `
      <h4>Contact</h4>
      <ul class="list-plain">
        <li>GIMPA Campus, Achimota, Accra, Ghana</li>
        <li>0202798583</li>
        <li>techfair@gimpa.edu.gh</li>
      </ul>
    `;
  }

  if (followColumn) {
    followColumn.innerHTML = `
      <h4>Follow Us</h4>
      <p>Stay updated with the latest news and announcements.</p>
      <ul class="list-plain footer-social-list">
        <li>Instagram: sotss_gimpa</li>
        <li>Facebook: School of Technology and Social Sciences, GIMPA</li>
        <li>LinkedIn: GIMPA School of Technology and Social Science</li>
      </ul>
    `;
  }

  if (organizerContact) {
    organizerContact.innerHTML = `
      <h3>Tech Fair Organizer Contacts</h3>
      <ul>
        <li><strong>Phone:</strong> 0202798583</li>
        <li><strong>Email:</strong> techfair@gimpa.edu.gh</li>
      </ul>
    `;
  }

  if (footerBottom) {
    const footerLinks = footerBottom.querySelector(".footer-links");
    let credit = footerBottom.querySelector(".footer-credit");
    if (!credit) {
      credit = document.createElement("div");
      credit.className = "footer-credit";
      credit.textContent = "Designed and created by Michelle Kplorla Dake";
    }

    if (footerLinks) {
      const links = Array.from(footerLinks.querySelectorAll("a"));
      const hrefMap = {
        "Privacy Policy": `${policyBase}privacy-policy.html`,
        "Terms of Service": `${policyBase}terms-of-service.html`,
        "Code of Conduct": `${policyBase}code-of-conduct.html`
      };

      links.forEach((link) => {
        const label = (link.textContent || "").trim();
        if (hrefMap[label]) link.href = hrefMap[label];
      });

      footerLinks.insertAdjacentElement("beforebegin", credit);
    } else if (!credit.parentElement) {
      footerBottom.appendChild(credit);
    }
  }
};

document.addEventListener("DOMContentLoaded", () => {
  toggle();
  setupNavDropdowns();
  setupContactToggle();
  setupBrandLogos();
  setupSharedSiteInfo();
});
