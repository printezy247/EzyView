import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router";

import { isTypingTarget } from "./hotkeys";
import { NAV_SECTIONS, type RoutePath } from "./nav";
import { shortcuts } from "./shortcuts";
import { resolveNavIntent, type NavKeyState } from "./sectionNavigation";
import { useNavRail } from "./navRail";

/**
 * The shell's keyboard navigation.
 *
 * The shortcut registry only fires on registered combos, and a chord is two
 * presses that only make sense together. So this listener runs alongside it,
 * with three guards that keep it out of the way: it ignores keys typed into a
 * field, it ignores every key while a dialog or a menu owns the keyboard, and
 * it stands down for a key the registry already handled.
 *
 * The listener reads the current path from the router rather than a closure,
 * so a key press always cycles from where the user actually is.
 */
export function useSectionNavigation(): void {
  const navigate = useNavigate();
  const location = useLocation();
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;

  useEffect(() => {
    const state: NavKeyState = { chordPending: false };

    const onKeyDown = (event: KeyboardEvent) => {
      // A dialog or a menu owns the keyboard while it is open.
      if (shortcuts.topLayer() !== null) {
        state.chordPending = false;
        return;
      }
      // The registry runs in the capture phase and marks a handled key. That
      // key is not ours.
      if (event.defaultPrevented) return;
      if (isTypingTarget(event.target as HTMLElement | null)) return;

      const { intent, state: next } = resolveNavIntent(
        {
          key: event.key,
          ctrl: event.ctrlKey,
          shift: event.shiftKey,
          alt: event.altKey,
          meta: event.metaKey,
        },
        state,
      );
      state.chordPending = next.chordPending;

      switch (intent.kind) {
        case "jump":
          event.preventDefault();
          navigate(intent.to);
          break;
        case "cycle": {
          event.preventDefault();
          const sections: RoutePath[] = NAV_SECTIONS.map((s) => s.to);
          const current = sections.indexOf(pathRef.current as RoutePath);
          const base = current === -1 ? (intent.step > 0 ? -1 : 0) : current;
          const nextIndex = (((base + intent.step) % sections.length) + sections.length) % sections.length;
          navigate(sections[nextIndex]!);
          break;
        }
        case "toggleRail":
          event.preventDefault();
          useNavRail.getState().toggle();
          break;
        default:
          break;
      }
    };

    // Bubble phase: the registry's capture listener gets first refusal.
    window.addEventListener("keydown", onKeyDown, false);
    return () => window.removeEventListener("keydown", onKeyDown, false);
  }, [navigate]);
}
