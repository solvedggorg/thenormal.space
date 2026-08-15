import { useEffect, useRef, type ComponentType } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Box, Droplets, Eye, Flag, Info, ListOrdered, Mail, Newspaper, WashingMachine } from "lucide-react";
import { brand, navCta, navGroups, type MegaId, type NavChild, type NavGroup } from "../../data/site";
import { easeOut } from "../../lib/motion";
import { useAppStore } from "../../store/app";

const iconMap: Record<NavChild["icon"], ComponentType<{ className?: string }>> = {
  droplets: Droplets,
  wash: WashingMachine,
  box: Box,
  eye: Eye,
  newspaper: Newspaper,
  info: Info,
  flag: Flag,
  list: ListOrdered,
  mail: Mail,
};

const panelSpring = { type: "spring" as const, stiffness: 380, damping: 28, mass: 0.7 };
const itemSpring = { type: "spring" as const, stiffness: 280, damping: 24, mass: 0.7 };

function NavItemIcon({ name }: { name: NavChild["icon"] }) {
  const Icon = iconMap[name];
  return <Icon className="nav-item-glyph" />;
}

function GroupChildren({
  group,
  onPick,
  reduce,
}: {
  group: NavGroup;
  onPick: () => void;
  reduce: boolean | null;
}) {
  return (
    <ul className="nav-panel-list">
      {group.children.map((child, index) => (
        <motion.li
          key={child.href + child.name}
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...itemSpring, delay: index * 0.03 }}
        >
          <a
            className="nav-item"
            href={child.href}
            target={child.external ? "_blank" : undefined}
            rel={child.external ? "noreferrer" : undefined}
            onClick={onPick}
          >
            <span className="nav-item-icon">
              <NavItemIcon name={child.icon} />
            </span>
            <span>
              <strong>{child.name}</strong>
              <em>{child.description}</em>
            </span>
          </a>
        </motion.li>
      ))}
    </ul>
  );
}

interface HeaderProps {
  path: string;
}

function useHeaderProgress(open: boolean, reduce: boolean | null) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    let frame = 0;
    let last = -1;

    const apply = (t: number) => {
      node.style.setProperty("--h-t", t.toFixed(4));
    };

    const measure = () => {
      frame = 0;
      if (open) {
        if (last !== 1) {
          last = 1;
          apply(1);
        }
        return;
      }

      const y = window.scrollY;
      const raw = Math.min(1, Math.max(0, (y - 6) / 70));
      const next = reduce ? (raw > 0.5 ? 1 : 0) : raw * raw * (3 - 2 * raw);
      if (Math.abs(next - last) < 0.001) return;
      last = next;
      apply(next);
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [open, reduce]);

  return ref;
}

function pathOf(href: string) {
  return href.split("#")[0] || href;
}

export default function Header({ path }: HeaderProps) {
  const { navOpen, mega, setNavOpen, setMega } = useAppStore();
  const closeTimer = useRef<number | null>(null);
  const reduce = useReducedMotion();
  const headerRef = useHeaderProgress(navOpen, reduce);

  useEffect(() => {
    document.body.style.overflow = navOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [navOpen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNavOpen(false);
        setMega(null);
      }
    };
    const onResize = () => {
      if (window.matchMedia("(min-width: 860px)").matches) {
        setNavOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [setMega, setNavOpen]);

  const current = (href: string) =>
    path === pathOf(href) || (pathOf(href) !== "/" && path.startsWith(`${pathOf(href)}/`))
      ? "page"
      : undefined;

  const groupCurrent = (group: NavGroup) =>
    current(group.href) || group.children.some((child) => current(child.href)) ? "page" : undefined;

  const clearClose = () => {
    if (closeTimer.current != null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const openGroup = (id: MegaId) => {
    clearClose();
    setMega(id);
  };

  const scheduleClose = () => {
    clearClose();
    closeTimer.current = window.setTimeout(() => setMega(null), 140);
  };

  const closeNow = () => {
    clearClose();
    setMega(null);
  };

  const closeMobile = () => {
    setNavOpen(false);
    setMega(null);
  };

  const toggleMobile = () => {
    if (navOpen) {
      closeMobile();
      return;
    }
    setMega(null);
    setNavOpen(true);
  };

  const toggleSection = (id: MegaId) => {
    setMega(mega === id ? null : id);
  };

  return (
    <header className="header" ref={headerRef} data-open={navOpen}>
      <div className="header-shell">
      <div className="header-bar">
        <div className="header-inner">
          <a className="brand" href="/" aria-label={`${brand.name} home`}>
            <span className="brand-lockup">
              <span className="brand-name">{brand.name}</span>
              <span className="brand-by">by {brand.society}</span>
            </span>
          </a>

          <nav className="nav-desktop" aria-label="Primary">
            {navGroups.map((group) => (
              <div
                className="nav-group"
                key={group.id}
                onMouseEnter={() => openGroup(group.id)}
                onMouseLeave={scheduleClose}
                onFocusCapture={() => openGroup(group.id)}
                onBlurCapture={scheduleClose}
              >
                <a
                  className="nav-trigger"
                  href={group.href}
                  aria-expanded={mega === group.id}
                  aria-haspopup="true"
                  aria-controls={`nav-panel-${group.id}`}
                  aria-current={groupCurrent(group)}
                >
                  {group.name}
                  <span className="nav-chevron" data-open={mega === group.id} aria-hidden="true">
                    ⌄
                  </span>
                </a>
                <AnimatePresence>
                  {mega === group.id && !navOpen && (
                    <div className="nav-panel-slot">
                      <motion.div
                        id={`nav-panel-${group.id}`}
                        className="nav-panel"
                        role="menu"
                        aria-label={group.name}
                        initial={reduce ? false : { opacity: 0, y: 10, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6, scale: 0.98 }}
                        transition={reduce ? { duration: 0 } : panelSpring}
                        onMouseEnter={() => openGroup(group.id)}
                        onMouseLeave={scheduleClose}
                      >
                        <div className="nav-panel-head">
                          <p className="nav-panel-kicker">{group.name}</p>
                          <p>{group.description}</p>
                        </div>
                        <GroupChildren group={group} onPick={closeNow} reduce={reduce} />
                      </motion.div>
                    </div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </nav>

          <div className="header-actions">
            <a className="header-cta-ghost" href="/contact">
              Contact
            </a>
            <a className="header-cta" href={navCta.href}>
              {navCta.label}
            </a>
            <button
              className="menu-btn"
              type="button"
              aria-label={navOpen ? "Close menu" : "Open menu"}
              aria-expanded={navOpen}
              aria-controls="mobile-menu"
              onClick={toggleMobile}
            >
              {navOpen ? "×" : "☰"}
            </button>
          </div>
        </div>
      </div>
      </div>

      <AnimatePresence>
        {navOpen && (
          <motion.nav
            id="mobile-menu"
            className="mobile-panel"
            aria-label="Primary"
            initial={reduce ? false : { opacity: 0, scale: 0.98, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -8 }}
            transition={{ duration: reduce ? 0 : 0.28, ease: easeOut }}
          >
            <div className="mobile-stack">
              {navGroups.map((group) => (
                <div className="mobile-group" key={group.id}>
                  <button
                    className="mobile-group-btn"
                    type="button"
                    aria-expanded={mega === group.id}
                    aria-controls={`mobile-panel-${group.id}`}
                    onClick={() => toggleSection(group.id)}
                  >
                    {group.name}
                    <span className="nav-chevron" data-open={mega === group.id} aria-hidden="true">
                      ⌄
                    </span>
                  </button>
                  <AnimatePresence initial={false}>
                    {mega === group.id && (
                      <motion.div
                        id={`mobile-panel-${group.id}`}
                        className="mobile-mega-wrap"
                        initial={reduce ? false : { height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: reduce ? 0 : 0.28, ease: easeOut }}
                      >
                        <p className="nav-panel-kicker">{group.description}</p>
                        <GroupChildren group={group} onPick={closeMobile} reduce={reduce} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
            <div className="mobile-foot">
              <a href="/contact" onClick={closeMobile}>
                Contact
              </a>
              <a className="header-cta" href={navCta.href} onClick={closeMobile}>
                {navCta.label}
              </a>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
