"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { WalletButton } from "../WalletButton";
import { ArkMark } from "./ArkMark";
import { Chevron, ExternalArrow, MenuIcon } from "./MenuIcon";
import { navigationFor, type NavLink, type NavMenu } from "./navigation";
import styles from "./SiteHeader.module.css";

/**
 * Primary navigation.
 *
 * A floating pill rather than a full-width bar. The reason is not decoration:
 * the bar detaching from the top edge lets the page's ambient background run
 * behind and around it, which is what stops a dark site from reading as a
 * stack of separate dark rectangles.
 *
 * INTERACTION MODEL
 *
 * Menus open on pointer-enter and on click, and that dual trigger is the
 * fiddly part. Hover alone is unusable by keyboard and hostile on touch;
 * click alone feels broken on a desktop marketing site. So:
 *
 *   - Pointer enter opens, pointer leave closes, but only for devices that
 *     actually hover (`matchMedia('(hover: hover)')`). A touch device reports
 *     synthetic hover on first tap, which would open a menu and immediately
 *     follow the link underneath it.
 *   - Click toggles, always. This is what a keyboard user gets via Enter.
 *   - Escape closes and returns focus to the trigger, and focus leaving the
 *     whole nav closes it — otherwise tabbing past the last menu item leaves
 *     an open panel floating over the page.
 *
 * Closing is deliberately delayed ~120ms on pointer-leave. Without it the menu
 * vanishes while the pointer crosses the gap between the trigger and the panel
 * below, which makes the whole nav feel like it is fighting you.
 */
const CLOSE_DELAY_MS = 120;

export function SiteHeader({ networkLinks }: { readonly networkLinks: readonly NavLink[] }) {
  const pathname = usePathname();
  const [openId, setOpenId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const navRef = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baseId = useId();
  const menus = navigationFor(networkLinks);

  const cancelClose = useCallback(() => {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpenId(null), CLOSE_DELAY_MS);
  }, [cancelClose]);

  // Any navigation closes everything. Without this, following a link inside a
  // menu leaves the menu open over the page it just took you to.
  useEffect(() => {
    setOpenId(null);
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => cancelClose, [cancelClose]);

  // The pill gains a border and a stronger blur once the page has scrolled
  // beneath it, so it separates from content without being boxed in at rest.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (openId === null && !drawerOpen) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpenId(null);
      setDrawerOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (navRef.current?.contains(event.target as Node) === true) return;
      setOpenId(null);
      setDrawerOpen(false);
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [openId, drawerOpen]);

  // The drawer takes over the viewport; the page behind it must not scroll.
  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [drawerOpen]);

  const canHover = useCallback(
    () => typeof window !== "undefined" && window.matchMedia("(hover: hover)").matches,
    [],
  );

  return (
    <div className={styles.dock} data-scrolled={scrolled}>
      <div
        className={styles.bar}
        ref={navRef}
        onBlur={(event) => {
          // relatedTarget is where focus is going. Null means it left the
          // document entirely, which also warrants closing.
          if (event.currentTarget.contains(event.relatedTarget)) return;
          setOpenId(null);
        }}
      >
        <Link href="/" className={styles.brand} aria-label="ArkBridge home">
          <ArkMark className={styles.mark} />
          <span className={styles.wordmark}>ArkBridge</span>
        </Link>

        <nav className={styles.nav} aria-label="Main">
          {menus.map((menu) => {
            const panelId = `${baseId}-${menu.id}`;
            const open = openId === menu.id;
            return (
              <div
                key={menu.id}
                className={styles.navItem}
                onPointerEnter={() => {
                  if (!canHover()) return;
                  cancelClose();
                  setOpenId(menu.id);
                }}
                onPointerLeave={() => {
                  if (!canHover()) return;
                  scheduleClose();
                }}
              >
                <button
                  type="button"
                  className={styles.trigger}
                  aria-expanded={open}
                  aria-controls={panelId}
                  data-open={open}
                  onClick={() => setOpenId(open ? null : menu.id)}
                >
                  {menu.label}
                  <Chevron className={styles.chevron} />
                </button>

                {open ? <MegaMenu id={panelId} menu={menu} /> : null}
              </div>
            );
          })}
        </nav>

        <div className={styles.actions}>
          <div className={styles.walletSlot}>
            <WalletButton />
          </div>
          <Link href="/bridge" className={styles.cta}>
            Bridge
          </Link>
          <button
            type="button"
            className={styles.burger}
            aria-expanded={drawerOpen}
            aria-label={drawerOpen ? "Close menu" : "Open menu"}
            onClick={() => setDrawerOpen((value) => !value)}
          >
            <span data-open={drawerOpen} />
            <span data-open={drawerOpen} />
          </button>
        </div>
      </div>

      {drawerOpen ? <Drawer menus={menus} onNavigate={() => setDrawerOpen(false)} /> : null}
    </div>
  );
}

/**
 * The expanded panel.
 *
 * Two shapes in one component: a plain list, and a list beside a titled grid of
 * numbered cards. Only the first menu carries the grid — a mega-menu on every
 * item is a site that has not decided what matters.
 */
function MegaMenu({ id, menu }: { readonly id: string; readonly menu: NavMenu }) {
  return (
    <div
      id={id}
      className={`${styles.panel} ark-menu-in`}
      data-wide={menu.feature !== undefined}
      role="group"
      aria-label={menu.label}
    >
      <ul className={styles.panelList}>
        {menu.links.map((link) => (
          <li key={link.href}>
            <MenuRow link={link} />
          </li>
        ))}
      </ul>

      {menu.feature === undefined ? null : (
        <div className={styles.feature}>
          <p className={styles.featureTitle}>{menu.feature.title}</p>
          <ul className={styles.featureGrid}>
            {menu.feature.items.map((item, index) => (
              <li key={`${item.href}-${item.label}`}>
                <Link href={item.href} className={styles.featureCard}>
                  {/* The ordinal is decoration, not content — a screen reader
                      announcing "zero one Ethereum" would be noise. */}
                  <span className={styles.featureIndex} aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function MenuRow({ link }: { readonly link: NavLink }) {
  const body = (
    <>
      {link.icon === undefined ? null : (
        <span className={styles.rowIcon} aria-hidden="true">
          <MenuIcon name={link.icon} />
        </span>
      )}
      <span className={styles.rowText}>
        <span className={styles.rowLabel}>
          {link.label}
          {link.external === true ? <ExternalArrow /> : null}
        </span>
        {link.description === undefined ? null : (
          <span className={styles.rowDescription}>{link.description}</span>
        )}
      </span>
      <span className={styles.rowChevron} aria-hidden="true">
        <Chevron />
      </span>
    </>
  );

  if (link.external === true) {
    return (
      <a className={styles.row} href={link.href} target="_blank" rel="noreferrer">
        {body}
      </a>
    );
  }
  return (
    <Link className={styles.row} href={link.href}>
      {body}
    </Link>
  );
}

/**
 * Mobile navigation.
 *
 * Everything, flat and scrollable. A phone has no room for progressive
 * disclosure and no hover to drive it — collapsing these into accordions would
 * add a tap to reach every destination in exchange for a shorter scroll, which
 * is the wrong trade on a list this size.
 */
function Drawer({
  menus,
  onNavigate,
}: {
  readonly menus: readonly NavMenu[];
  readonly onNavigate: () => void;
}) {
  return (
    <div className={`${styles.drawer} ark-menu-in`}>
      {menus.map((menu) => (
        <section key={menu.id} className={styles.drawerSection}>
          <p className={styles.drawerTitle}>{menu.label}</p>
          {menu.links.map((link) =>
            link.external === true ? (
              <a
                key={link.href}
                className={styles.drawerLink}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                onClick={onNavigate}
              >
                {link.label}
                <ExternalArrow />
              </a>
            ) : (
              <Link
                key={link.href}
                className={styles.drawerLink}
                href={link.href}
                onClick={onNavigate}
              >
                {link.label}
              </Link>
            ),
          )}
        </section>
      ))}

      <Link href="/bridge" className={styles.drawerCta} onClick={onNavigate}>
        Open the bridge
      </Link>
    </div>
  );
}
