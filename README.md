# DeltaVision (demo)

Two working front-end demos of the DeltaVision trading concept:

- **Web**: a desktop "workspace" with floating, draggable windows over a canyon landscape. It has stock info, a main chart, a new-order ticket, a ticker dock and a toolbar.
- **Mobile**: a phone app with a portfolio screen (frozen-forest background) and a ticker screen (aurora background), including volatility panels and an options chain.

Everything runs on a **simulated market**. Prices tick every second, and orders, positions, P/L and alerts are all live. No account, API key or internet connection is needed.

## Running it

You need Python 3.8+ (standard library only). For real app windows, also have Chrome, Edge, Brave or Chromium installed. Without one of those, it opens in your default browser.

| OS      | Double-click            | Or from a terminal            |
|---------|-------------------------|-------------------------------|
| Windows | `DeltaVision.bat`       | `py launch.py`                |
| macOS   | `DeltaVision.command`   | `python3 launch.py`           |
| Linux   | `deltavision.sh`        | `python3 launch.py`           |

```
python3 launch.py           # both apps (default)
python3 launch.py web       # desktop app only
python3 launch.py mobile    # mobile app only
python3 launch.py --tabs    # use normal browser tabs instead of app windows
python3 launch.py --browser "/path/to/chrome"
```

The launcher serves this folder on `127.0.0.1` and opens each app in its own chromeless window. It stops by itself about a minute after you close the last window. You can also press Ctrl+C.

When both apps run together they share one market and one account. A trade placed on the desktop shows up on the phone instantly, and prices match tick for tick.

> On macOS the first run of `DeltaVision.command` may need right-click → Open (Gatekeeper).
> Opening the HTML files directly (`file://`) also works in most browsers, but the bundled font and window sync are most reliable through the launcher.

## Web app

| Area | What you can do |
|------|-----------------|
| Windows | Drag by the title bar (it snaps to edges and other windows; hold Alt to skip snapping). Resize from the edges. The traffic-light dots maximize, minimize and close. Double-click a title to collapse it. Layout is remembered. |
| Menu | Click **DELTAVISION** (top left) to reopen windows, reset the layout, switch backgrounds, change the chart color, set the simulation speed, open the mobile companion, or reset the account. |
| Chart | Timeframes 1D to MAX. Hover for a crosshair and tooltip, scroll to zoom, drag to pan, double-click to reset. Toolbar: line or candles, pen, text note, measure. Right-click for limit/stop orders and clearing drawings. Working orders show as dashed lines; drag a tag to move the order. |
| Stock information | Illustration, description, key stats. **AI stock analysis** writes a (simulated) take, and the BUY / HOLD / SELL marker moves with it. |
| New order | Market / limit / stop, share stepper (arrow keys, mouse wheel, Shift for ×10), live estimate, SELL / BUY. |
| Ticker dock | Hover to magnify; click to switch ticker. Drag to reorder, or drag out to the left to remove. **+** adds tickers. |
| Toolbar | Rotating news (▾ for the full list). Position P/L (ⓘ for details). **Close Losing / Close All / Close Winning** with confirmation and Undo. The **All live trades / Current ticker** radios set the scope. |
| Portfolio | Menu → Portfolio, the `F` key, or click the P/L figure. Equity chart, holdings, working orders, activity and alerts. |

**Shortcuts:** `Ctrl/⌘ K` or `/` search · `1`–`9` timeframes · `↑`/`↓` previous/next ticker in the dock · `L`/`C` line or candles · `P`/`T`/`M` tools · `Del` delete the selected drawing · `F` portfolio · `?` help · `Esc` cancel.

## Mobile app

- **Portfolio:** drag over the chart to scrub (the header shows the value and date). Tap the header P/L to cycle All Time / Today / Value. Tap the Alerts card to open alerts; swipe one left to dismiss. Use the Today / All Time toggle on the breakdown. Tap a row to open the ticker, or long-press and drag to reorder. Tap the portfolio logo for settings.
- **Ticker:** scrub the chart and pick a timeframe. **BUY / SELL** opens an order sheet (market/limit/stop, quick amounts, *swipe to confirm*). **Options Chain** has expiries, calls and puts, live greeks, and buy/sell contracts. Tap the position card for details. Volatility curves show values on hover. Further down are key stats, About, AI analysis and news. Tap the logo to add the ticker to your watchlist.
- **Navigation:** bottom-left corner switches between portfolio and the last ticker. Bottom-right opens search. Swipe from the left edge to go back. Tap or flick up the home bar to go home. Sheets drag down to close. With a mouse, drag the page to scroll.
- If the window is wider than a phone, the app shows inside a phone frame (change this in Settings).

## Customizing

- **Backgrounds** are painted live (canyon, aurora, frozen forest). To use a real photo, such as the originals from the design screenshots, drop an image onto the web app or choose *Custom image…* in the menu. On mobile, use Settings → Custom photo.
- **Securities and starting positions** are defined at the top of `shared/core.js` (`DEFS` and `defaultState`). Each ticker's one-year chart shape comes from its `shape` anchor points.

## Project layout

```
launch.py               local server + app-window launcher (stdlib only)
DeltaVision.bat/.command, deltavision.sh   double-click wrappers
shared/core.js          market simulation, account, options math, cross-window sync
shared/chart.js         canvas chart engine (glow lines, candles, tools, curves)
shared/scenes.js        procedural animated backgrounds
shared/art.js           ticker logos and company illustrations (SVG)
shared/base.css, fonts/ shared styles and the bundled Inter font (OFL)
web/                    desktop app
mobile/                 mobile app
```

All market data, news, analysis and figures are simulated for demonstration only and are not financial advice. Company names and logos are used only as placeholders in this mock-up.
