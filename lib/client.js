/**
 * dsh-reversed-chat — DeepSeek Harness Web client plugin (browser half).
 *
 * What it does (v0.2):
 *   1. Composer placement: new conversation (stock `hero` phase) stays centered; an
 *      active conversation pins the composer seat to the TOP of the viewport
 *      (stock pins it to the bottom).
 *   2. Reversed reading: the transcript renders newest-turn-at-top (under the
 *      composer), so new model replies always appear where you are already
 *      looking — no neck mileage. Scrolling down reads back through history.
 *
 * How (borrowed from dsh-layout-control's approach):
 *   - One flag attribute on <html> (`data-dsh-reversed-chat`) + one stylesheet.
 *     All selectors key on STABLE anchors ([data-phase] / [data-content-phase] /
 *     [data-composer-seat] / [data-conversation-scroll] / [data-slot=…]) — never
 *     CSS-module hashed names.
 *   - A 400ms watcher marks the top-level conversation scrollport with
 *     `data-dsh-top-main`, so embedded conversations (subagent panels,
 *     right-sidebar chat) are never affected.
 *   - The same watcher structurally marks the stock "jump to bottom" slot
 *     (a floating container whose only child is an icon-only button) with
 *     `data-dsh-to-bottom-slot`. That slot exposes no stable attribute — only a
 *     CSS-module class name — so it is identified by structure instead, and no
 *     hashed class name is used anywhere in this plugin.
 *
 * Reversal mechanics (why it is safe):
 *   - The transcript is NOT virtualized; flow items are the direct children of
 *     `[data-slot="conversation.chat.flow"]` (stock CSS styles them as
 *     `:is(.column, [data-slot="conversation.chat.flow"]) > .flowItem`).
 *     `flex-direction: column-reverse` therefore flips the VISUAL order only —
 *     DOM order (and every stock measurement keyed to it) is untouched.
 *   - Stock "jump to tail" always targets `metrics.floor` (max scroll) via
 *     `el.scrollTop = …` or `el.scrollTo({ top: floor })`. We shadow those two
 *     properties ON THE SCROLLER ELEMENT INSTANCE and rewrite bottom-anchored
 *     jumps to top (where the newest message now lives). Reads pass through, so
 *     the stock state machine just observes "user is not at the tail" and never
 *     fights us; geometry-based jumps (turn rail, anchor restores) pass through
 *     untouched and stay exact.
 *   - `overflow-anchor: none` keeps the viewport at scrollTop 0 while new items
 *     insert above the older ones (the whole stack slides down under the
 *     newest message you are reading).
 *
 * v0.6 — active turn under reversed reading:
 *   The turn rail's highlight comes from the stock reading-line probe
 *   `readVisibleTurn()`: a binary search over the flow rows that assumes DOM
 *   order == visual top-to-bottom order. `column-reverse` reverses the visual
 *   order, so that search can never reach the newest row and falls back to
 *   `turns[0]` — the OLDEST turn — which is wrong in both directions: the rail
 *   marked the earliest turn while you were reading the newest one.
 *   While the probe runs, the plugin shadows `getBoundingClientRect` ON THE
 *   FLOW ROW ELEMENTS and reports `top` in the order the probe expects, so the
 *   search lands on the row under the reading line (newest by default). Every
 *   other caller still gets the untouched rect, so anchor capture/restore and
 *   rail jumps stay geometry-exact.
 *
 * v0.7.2 — composer popup menus under reversed layout:
 *   The stock add (`+`) and slash (`/`) menus are absolutely positioned with
 *   `bottom: calc(100% + 4px)` against a zero-height overlay anchor at the
 *   card's top, so with the composer pinned to the top they opened above the
 *   viewport. The plugin moves that anchor to the card's bottom and, whenever
 *   a menu is open, places it 4px below the card with a max height clamped to
 *   the space below (covers both the trigger menu and the popup-select card,
 *   which exposes no stable attribute).
 *
 * Stock DOM (DSH 0.2.1-rc.2, @deepseek-ai/dsh-client-ui-conversation / ui-chat):
 *   root[data-phase="hero|settling|active"]
 *     └ body[data-content-phase="…"][data-conversation-content]
 *         └ [data-conversation-scroll]                  ← the scrollport
 *             ├ … → .column[data-chat-flow]
 *       │       ├ [.older button]                 ← "load earlier"
 *       │       └ [data-slot="conversation.chat.flow"]
 *       │           └ .flowItem …                 ← oldest → newest
 *             └ [data-composer-seat]                    ← stock pins it to the bottom
 *         (the stock "jump to bottom" slot floats inside the ChatView frame,
 *          still within the same scrollport, and carries no stable attribute)
 */
window.__ModuleLoader__.load({
  id: 'dsh-reversed-chat',
  factory: () => {
    const module = { exports: {} }
    const exports = module.exports

    const PLUGIN_ID = 'dsh-reversed-chat'
    const HTML_ATTR = 'data-dsh-reversed-chat'
    const MAIN_ATTR = 'data-dsh-top-main'
    const TO_BOTTOM_ATTR = 'data-dsh-to-bottom-slot'
    const WATCH_MS = 400
    const FLOW_SLOT_SELECTOR = '[data-slot="conversation.chat.flow"]'
    const RECT_SHIM = '__dshComposerTopRealRect'
    const PROBE_FRAME = 'readVisibleTurn'
    const OVERLAY_SELECTOR = '[data-composer-overlay]'
    const CARD_SELECTOR = '[data-composer-card]'
    const MENU_ATTR = 'data-dsh-flipped-menu'

    /**
     * Specificity notes: `html[attr] …` gives (0,n,1), beating the stock
     * `.root[data-phase=active] .composerSeat` (0,3,0) regardless of load order.
     */
    const CSS = `
/* --- composer placement ------------------------------------------------ */
/* Pin the composer seat to the top of the conversation pane.
   The top padding gives the floating card breathing room under the tab divider
   and lets its soft elevation shadow render (the scrollport would otherwise
   clip it right at the hairline); the opaque strip above the card stops the
   transcript from peeking through. The background then fades out over the
   seat's bottom padding so content scrolling under the composer is absorbed
   instead of hard-clipped. All sizes are overridable CSS variables. */
html[${HTML_ATTR}] [data-content-phase="active"] > [${MAIN_ATTR}] > [data-composer-seat] {
  order: -1;
  position: sticky;
  top: 0;
  bottom: auto;
  padding-top: var(--dsh-reversed-chat-top-gap, 12px);
  padding-bottom: var(--dsh-reversed-chat-bottom-gap, 8px);
  background: linear-gradient(
    to bottom,
    var(--dsw-alias-bg-base) 0,
    var(--dsw-alias-bg-base) calc(100% - var(--dsh-reversed-chat-fade, 20px)),
    transparent 100%
  );
}

/* --- composer popup menus ---------------------------------------------- */
/* The stock add / slash menus open UPWARD from a zero-height overlay anchor at
   the card's top; with the composer pinned to the top they would render above
   the viewport. Move that anchor to the card's bottom and open the menus
   downward (the script refines exact geometry whenever a menu is open). */
html[${HTML_ATTR}] [data-content-phase="active"] > [${MAIN_ATTR}] [data-composer-overlay] {
  top: 100% !important;
}
html[${HTML_ATTR}] [data-content-phase="active"] > [${MAIN_ATTR}] [data-composer-overlay] > * {
  bottom: auto !important;
  top: calc(100% + 4px) !important;
  max-height: min(400px, calc(100vh - 300px)) !important;
}

/* --- reversed reading --------------------------------------------------- */
/* Flow items: newest on top. DOM order stays oldest->newest. */
html[${HTML_ATTR}] [${MAIN_ATTR}] [data-slot="conversation.chat.flow"] {
  display: flex !important;
  flex-direction: column-reverse !important;
}
/* The column hosting ["load earlier", flow]: push the older-messages button
   to the bottom (the oldest end in reversed reading). */
html[${HTML_ATTR}] [${MAIN_ATTR}] :has(> [data-slot="conversation.chat.flow"]) {
  flex-direction: column-reverse !important;
}
/* New items insert above the older ones; keep the viewport pinned instead of
   letting scroll anchoring slide the reading position away. */
html[${HTML_ATTR}] [${MAIN_ATTR}] {
  overflow-anchor: none !important;
}
/* Stock "jump to bottom" button: its direction/visibility logic assumes a
   bottom-anchored tail, which no longer holds — hide its slot. The slot has no
   stable attribute in the stock DOM, so the watcher tags it structurally; no
   CSS-module hashed class name is involved. Failure mode if the stock DOM
   changes: only this button stays visible. */
html[${HTML_ATTR}] [${MAIN_ATTR}] [${TO_BOTTOM_ATTR}] {
  display: none !important;
}

/* --- turn navigator rail (right side) ----------------------------------- */
/* The rail is a TanStack-virtualized list of dots, oldest first. Mirroring the
   frame renders the newest dot at the top while every virtualizer scroll /
   offset computation stays untouched. Centering, click-to-jump and hover
   previews all keep working because they are geometry-based.
   
   The mirror MUST be folded into the frame's own transform. The stock frame
   centers itself with transform: translateY(-50%); a standalone
   scale: 1 -1 property composes AFTER transform, so it also flips that
   centering translate — the frame drops by its own height (up to 420px, half
   off-screen). transform: translateY(-50%) scaleY(-1) keeps the centering
   translate outside the flip, so the frame stays exactly where stock puts it. */
html[${HTML_ATTR}] [${MAIN_ATTR}] nav:has(button[data-index]) {
  transform: translateY(-50%) scaleY(-1);
}
/* Do NOT counter-flip the dots. A dot's position IS its own inline
   transform: translate3d(0, start, 0) written by the virtualizer; the
   standalone scale property would flip that translate too, moving each dot to
   the mirrored side of its slot — outside the scroller's overflow clip — so
   only the first/last dot stayed visible ("only one jump dot"). The glyph is a
   horizontal 20x2 bar (.mark::before), symmetric, so it needs no upright flip
   at all. */
/* Hover preview rides mirrored with its dot automatically (its box center is
   derived from the dot's un-mirrored center, so mirroring maps it onto the
   mirrored dot); flip only its text children so they read upright. The two
   lines (prompt/response) swap vertical order — cosmetic. */
html[${HTML_ATTR}] [${MAIN_ATTR}] nav:has(button[data-index]) [role="tooltip"] > * {
  scale: 1 -1;
}
`

    function installStyle() {
      const style = document.createElement('style')
      style.setAttribute('data-plugin', PLUGIN_ID)
      style.textContent = CSS
      document.head.appendChild(style)
      return () => style.remove()
    }

    /**
     * Mark the first top-level conversation scrollport. "Top-level" = its
     * [data-conversation-content] has no further [data-conversation-content]
     * ancestor, so subagent / right-sidebar conversations never match.
     */
    function markMainScroll() {
      let marked = false
      for (const el of document.querySelectorAll('[data-conversation-scroll]')) {
        if (!(el instanceof HTMLElement)) continue
        const body = el.closest('[data-conversation-content]')
        const topLevel = body !== null && body.parentElement?.closest('[data-conversation-content]') === null
        if (topLevel && !marked) {
          el.setAttribute(MAIN_ATTR, '')
          marked = true
        } else if (el.hasAttribute(MAIN_ATTR)) {
          el.removeAttribute(MAIN_ATTR)
        }
      }
      return marked ? document.querySelector(`[${MAIN_ATTR}]`) : null
    }

    /**
     * Mark the stock "jump to bottom" floating slot. It has no stable attribute
     * (only a CSS-module class name), so it is identified structurally: inside
     * the main scrollport, a floating (absolute/sticky) container whose only
     * child is an icon-only <button>, outside the transcript flow, the composer
     * seat and the turn rail. The three guards keep this from matching any other
     * control. If the stock DOM ever changes, the only consequence is that the
     * button stays visible (cosmetic).
     */
    function markToBottomSlot(main) {
      const found = []
      if (main !== null) {
        for (const el of main.querySelectorAll('div')) {
          const only = el.children.length === 1 ? el.firstElementChild : null
          if (only === null || only.tagName !== 'BUTTON') continue
          if (only.textContent.trim() !== '' || only.querySelector('svg') === null) continue
          if (el.closest('[data-slot="conversation.chat.flow"], [data-composer-seat], nav, [role="tooltip"]') !== null) continue
          const parent = el.parentElement
          if (parent === null || parent.querySelector('[data-chat-flow]') === null) continue
          const position = window.getComputedStyle(el).position
          if (position !== 'sticky' && position !== 'absolute') continue
          found.push(el)
        }
      }
      for (const el of document.querySelectorAll(`[${TO_BOTTOM_ATTR}]`)) {
        if (!found.includes(el)) el.removeAttribute(TO_BOTTOM_ATTR)
      }
      for (const el of found) el.setAttribute(TO_BOTTOM_ATTR, '')
    }

    /** True only while the stock reading-line probe is on the stack. */
    function isReadingProbe() {
      try {
        const stack = new Error().stack
        return typeof stack === 'string' && stack.includes(PROBE_FRAME)
      } catch {
        return false
      }
    }

    /** The flow slot owned by THIS scrollport (never a nested conversation's). */
    function topLevelFlow(main) {
      if (main === null) return null
      for (const flow of main.querySelectorAll(FLOW_SLOT_SELECTOR)) {
        if (flow instanceof HTMLElement && flow.closest('[data-conversation-scroll]') === main) return flow
      }
      return null
    }

    /** Memo so one probe (one synchronous search) never re-walks the flow. */
    const probeMemo = { at: -1, main: null, top: NaN, count: -1, row: -1 }

    /**
     * Index of the flow row under the reading line. Reversed reading puts the
     * newest row at the visual top, so the row you are reading is the flow row
     * whose `top` is the greatest one at or above the line; with no such row
     * (line above the transcript, e.g. under the composer) the topmost row.
     */
    function readingRowIndex(main, flow, line) {
      const rows = flow.children
      const count = rows.length
      const scrollTop = main.scrollTop
      const now = performance.now()
      if (probeMemo.main === main && probeMemo.count === count && probeMemo.top === scrollTop && now - probeMemo.at < 32) {
        return probeMemo.row
      }
      let best = -1
      let bestTop = -Infinity
      let topmost = -1
      let topmostTop = Infinity
      for (let i = 0; i < count; i++) {
        const row = rows[i]
        if (!(row instanceof HTMLElement)) continue
        if (row.getAttribute('data-chat-turn') === null) continue
        const rect = typeof row[RECT_SHIM] === 'function' ? row[RECT_SHIM]() : row.getBoundingClientRect()
        if (rect.height <= 0) continue
        if (rect.top < topmostTop) {
          topmostTop = rect.top
          topmost = i
        }
        if (rect.top <= line && rect.top > bestTop) {
          bestTop = rect.top
          best = i
        }
      }
      const index = best >= 0 ? best : topmost
      probeMemo.at = now
      probeMemo.main = main
      probeMemo.top = scrollTop
      probeMemo.count = count
      probeMemo.row = index
      return index
    }

    /** Flow row elements whose getBoundingClientRect is currently shadowed. */
    const shimmedRows = new Set()

    /**
     * Shadow one flow row's rect. During the stock probe the row reports a
     * synthetic `top` that reproduces visual order (rows up to the reading row
     * report `line - 1`, later rows report `line + 2`), so the probe's binary
     * search lands on the reading row. Outside the probe the real rect passes
     * through byte-for-byte.
     */
    function installRowShim(row) {
      if (shimmedRows.has(row)) return
      shimmedRows.add(row)
      const real = row.getBoundingClientRect.bind(row)
      row[RECT_SHIM] = real
      Object.defineProperty(row, 'getBoundingClientRect', {
        configurable: true,
        writable: true,
        value: function () {
          const rect = real()
          const flow = this.parentElement
          if (flow === null || !flow.matches(FLOW_SLOT_SELECTOR)) return rect
          if (!isReadingProbe()) return rect
          const main = this.closest(`[${MAIN_ATTR}]`)
          if (main === null) return rect
          const viewport = main.getBoundingClientRect()
          const line = viewport.top + Math.min(96, main.clientHeight * 0.2)
          const row = Array.prototype.indexOf.call(flow.children, this)
          if (row < 0) return rect
          const reading = readingRowIndex(main, flow, line)
          return {
            top: row <= reading ? line - 1 : line + 2,
            right: rect.right,
            bottom: rect.bottom,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            x: rect.x,
            y: rect.y,
          }
        },
      })
    }

    let rowObserver = null
    let rowObserverTarget = null

    /** Keep every current flow row shimmed; follow row insertions/removals. */
    function syncRowShims(main) {
      const flow = topLevelFlow(main)
      if (flow === null) {
        if (rowObserver !== null) {
          rowObserver.disconnect()
          rowObserver = null
          rowObserverTarget = null
        }
        return
      }
      if (rowObserverTarget !== flow) {
        if (rowObserver !== null) rowObserver.disconnect()
        for (const row of Array.from(shimmedRows)) {
          if (row.parentElement !== flow) {
            delete row[RECT_SHIM]
            delete row.getBoundingClientRect
            shimmedRows.delete(row)
          }
        }
        rowObserverTarget = flow
        rowObserver = new MutationObserver(() => {
          for (const child of flow.children) {
            if (child instanceof HTMLElement) installRowShim(child)
          }
        })
        rowObserver.observe(flow, { childList: true })
        if (nudgeTimer !== null) window.clearTimeout(nudgeTimer)
        nudgeTimer = window.setTimeout(() => {
          nudgeTimer = null
          nudgeReadingProbe()
        }, 60)
      }
      for (const child of flow.children) {
        if (child instanceof HTMLElement) installRowShim(child)
      }
    }

    function releaseRowShims() {
      if (rowObserver !== null) {
        rowObserver.disconnect()
        rowObserver = null
        rowObserverTarget = null
      }
      for (const row of shimmedRows) {
        delete row[RECT_SHIM]
        delete row.getBoundingClientRect
      }
      shimmedRows.clear()
      probeMemo.main = null
      probeMemo.count = -1
      probeMemo.row = -1
    }

    let fastSyncQueued = false
    let fastObserver = null
    let nudgeTimer = null

    /** Ask the stock reading policy to re-run its probe (synthetic scroll). */
    function nudgeReadingProbe() {
      const scroller = document.querySelector(`[${MAIN_ATTR}]`)
      if (scroller === null) return
      try {
        scroller.dispatchEvent(new Event('scroll'))
      } catch {
        /* ignore */
      }
    }

    /**
     * The stock probe runs on the animation frame right after a chat view mounts,
     * so the shims must exist within that same task. React commits the rows
     * synchronously and the microtask checkpoint follows, which is early enough:
     * a subtree observer (childList only — text streaming does not fire it) runs
     * the cheap sync there. The 400ms watcher remains the fallback.
     */
    function fastSync() {
      fastSyncQueued = false
      const main = document.querySelector(`[${MAIN_ATTR}]`)
      if (main === null) {
        syncScrollFlip()
        return
      }
      syncRowShims(main)
    }

    function installFastObserver() {
      if (typeof MutationObserver !== 'function') return () => {}
      fastObserver = new MutationObserver(() => {
        if (fastSyncQueued) return
        fastSyncQueued = true
        queueMicrotask(fastSync)
      })
      fastObserver.observe(document.documentElement, { childList: true, subtree: true })
      return () => {
        if (fastObserver !== null) fastObserver.disconnect()
        fastObserver = null
        fastSyncQueued = false
        if (nudgeTimer !== null) window.clearTimeout(nudgeTimer)
        nudgeTimer = null
      }
    }

    /* --- composer overlay menus ------------------------------------------- */
    let menuObserver = null
    let menuObserverTarget = null

    /** True when the overlay belongs to the pinned (active) composer. */
    function isPinnedComposer(overlay) {
      return overlay.closest('[data-content-phase="active"]') !== null && overlay.closest(`[${MAIN_ATTR}]`) !== null
    }

    /** Menu surfaces: absolutely positioned elements anchored to the bottom. */
    function menuSurfaces(overlay) {
      const found = []
      const walk = (node) => {
        for (const child of node.children) {
          if (!(child instanceof HTMLElement)) continue
          const style = window.getComputedStyle(child)
          if (style.position === 'absolute' && (style.bottom !== 'auto' || child.hasAttribute(MENU_ATTR))) {
            found.push(child)
          }
          walk(child)
        }
      }
      walk(overlay)
      return found
    }

    /** Flip the stock upward-opening composer menus to open downward. */
    function placeMenus(overlay) {
      if (!isPinnedComposer(overlay)) return
      const card = overlay.closest(CARD_SELECTOR)
      if (card === null) return
      const cardRect = card.getBoundingClientRect()
      const space = window.innerHeight - cardRect.bottom - 16
      for (const menu of menuSurfaces(overlay)) {
        const cap = menu.hasAttribute('data-trigger-menu') ? 400 : 320
        const maxHeight = Math.max(140, Math.min(cap, space))
        const parent = menu.offsetParent instanceof HTMLElement ? menu.offsetParent.getBoundingClientRect() : cardRect
        menu.setAttribute(MENU_ATTR, '')
        menu.style.setProperty('top', (cardRect.bottom + 4 - parent.top) + 'px', 'important')
        menu.style.setProperty('bottom', 'auto', 'important')
        menu.style.setProperty('left', (cardRect.left - parent.left) + 'px', 'important')
        menu.style.setProperty('width', cardRect.width + 'px', 'important')
        menu.style.setProperty('max-height', maxHeight + 'px', 'important')
      }
    }

    /** Watch the composer overlay anchor so menus are placed as soon as they open. */
    function syncComposerMenus(main) {
      const overlay = main === null ? null : main.querySelector(OVERLAY_SELECTOR)
      if (overlay === null) {
        if (menuObserver !== null) {
          menuObserver.disconnect()
          menuObserver = null
          menuObserverTarget = null
        }
        return
      }
      placeMenus(overlay)
      if (menuObserverTarget !== overlay) {
        if (menuObserver !== null) menuObserver.disconnect()
        menuObserverTarget = overlay
        menuObserver = new MutationObserver(() => placeMenus(overlay))
        menuObserver.observe(overlay, { childList: true, subtree: true })
      }
    }

    function releaseComposerMenus() {
      if (menuObserver !== null) {
        menuObserver.disconnect()
        menuObserver = null
        menuObserverTarget = null
      }
    }

    /**
     * Rewrite bottom-anchored jumps ("follow tail", "open session at tail") into
     * top jumps: in reversed reading the newest message lives at scrollTop 0.
     * Only near-floor targets are rewritten; every other programmatic scroll
     * (rail jumps, anchor restores) passes through exactly.
     * The accessors are defined on the element instance and removed on cleanup,
     * so the stock prototype behavior is untouched when the plugin is off.
     */
    function installScrollFlip(scrollEl) {
      if (scrollEl.__dshTopFlip === true) return () => {}
      const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')
      const scrollToProto = Element.prototype.scrollTo
      if (desc === undefined) return () => {}
      const maxOf = () => scrollEl.scrollHeight - scrollEl.clientHeight
      const isFloor = (v) => typeof v === 'number' && Number.isFinite(v) && v >= maxOf() - 2
      Object.defineProperty(scrollEl, 'scrollTop', {
        configurable: true,
        get() { return desc.get.call(scrollEl) },
        set(v) { desc.set.call(scrollEl, isFloor(v) ? 0 : v) },
      })
      scrollEl.scrollTo = function (...args) {
        const first = args[0]
        if (typeof first === 'object' && first !== null && 'top' in first) {
          if (isFloor(first.top)) return scrollToProto.call(scrollEl, { ...first, top: 0 })
          return scrollToProto.call(scrollEl, ...args)
        }
        if (typeof first === 'number' && isFloor(args[1])) {
          return scrollToProto.call(scrollEl, first, 0)
        }
        return scrollToProto.call(scrollEl, ...args)
      }
      scrollEl.__dshTopFlip = true
      return () => {
        delete scrollEl.scrollTop
        delete scrollEl.scrollTo
        delete scrollEl.__dshTopFlip
      }
    }

    let flipTarget = null
    let flipCleanup = null

    function syncScrollFlip() {
      const main = markMainScroll()
      markToBottomSlot(main)
      syncRowShims(main)
      syncComposerMenus(main)
      if (main === flipTarget) return
      if (flipCleanup !== null) {
        flipCleanup()
        flipCleanup = null
      }
      flipTarget = main instanceof HTMLElement ? main : null
      flipCleanup = flipTarget !== null ? installScrollFlip(flipTarget) : null
    }

    function installMarker() {
      syncScrollFlip()
      const id = window.setInterval(syncScrollFlip, WATCH_MS)
      const stopFast = installFastObserver()
      return () => {
        window.clearInterval(id)
        stopFast()
        if (flipCleanup !== null) flipCleanup()
        flipCleanup = null
        flipTarget = null
        releaseRowShims()
        releaseComposerMenus()
        for (const el of document.querySelectorAll(`[${MAIN_ATTR}]`)) el.removeAttribute(MAIN_ATTR)
        for (const el of document.querySelectorAll(`[${TO_BOTTOM_ATTR}]`)) el.removeAttribute(TO_BOTTOM_ATTR)
      }
    }

    const inject = []

    /**
     * Client plugin body. One effect: flag <html>, install style + marker +
     * scroll flip; cleanup removes everything (stock layout returns verbatim).
     */
    function apply(ctx) {
      ctx.effect(() => {
        document.documentElement.setAttribute(HTML_ATTR, '')
        const removeStyle = installStyle()
        const removeMarker = installMarker()
        return () => {
          removeMarker()
          removeStyle()
          document.documentElement.removeAttribute(HTML_ATTR)
        }
      }, PLUGIN_ID)
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  }
})
