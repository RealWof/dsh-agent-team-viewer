/* ------------------------------------------------------------------ *
 * Icons — Lucide-derived geometry (ISC), inlined so the bundle needs no
 * import. `Icon` renders nothing for an unknown name, so the map below is
 * the only glyph source in this plugin.
 * ------------------------------------------------------------------ */

    /** Glyph name -> SVG child descriptors. @type {Record<string, Array<{tag: string, attrs: object}>>} */
    const ICON_GLYPHS = {
      'kanban': [
        { tag: 'rect', attrs: { x: 3, y: 3, width: 18, height: 18, rx: 2 } },
        { tag: 'path', attrs: { d: 'M8 7v9' } },
        { tag: 'path', attrs: { d: 'M12 7v5' } },
        { tag: 'path', attrs: { d: 'M16 7v7' } },
      ],
      'users': [
        { tag: 'path', attrs: { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' } },
        { tag: 'circle', attrs: { cx: 9, cy: 7, r: 4 } },
        { tag: 'path', attrs: { d: 'M22 21v-2a4 4 0 0 0-3-3.87' } },
        { tag: 'path', attrs: { d: 'M16 3.13a4 4 0 0 1 0 7.75' } },
      ],
      'check': [{ tag: 'path', attrs: { d: 'M20 6 9 17l-5-5' } }],
      'x': [
        { tag: 'path', attrs: { d: 'M18 6 6 18' } },
        { tag: 'path', attrs: { d: 'm6 6 12 12' } },
      ],
      'clock': [
        { tag: 'circle', attrs: { cx: 12, cy: 12, r: 9 } },
        { tag: 'path', attrs: { d: 'M12 7v5l3 2' } },
      ],
      'coin': [
        { tag: 'circle', attrs: { cx: 12, cy: 12, r: 9 } },
        { tag: 'path', attrs: { d: 'M15 9.5a3 3 0 0 0-3-2.5c-1.7 0-3 1-3 2.4 0 3.4 6 1.8 6 5.2 0 1.4-1.3 2.4-3 2.4a3 3 0 0 1-3-2.5' } },
        { tag: 'path', attrs: { d: 'M12 5v14' } },
      ],
      'gauge': [
        { tag: 'path', attrs: { d: 'm12 14 4-4' } },
        { tag: 'path', attrs: { d: 'M3.34 19a10 10 0 1 1 17.32 0' } },
      ],
      'hash': [
        { tag: 'path', attrs: { d: 'M4 9h16' } },
        { tag: 'path', attrs: { d: 'M4 15h16' } },
        { tag: 'path', attrs: { d: 'M10 3 8 21' } },
        { tag: 'path', attrs: { d: 'M16 3l-2 18' } },
      ],
      'link': [
        { tag: 'path', attrs: { d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' } },
        { tag: 'path', attrs: { d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' } },
      ],
      'alert': [
        { tag: 'path', attrs: { d: 'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z' } },
        { tag: 'path', attrs: { d: 'M12 9v4' } },
        { tag: 'path', attrs: { d: 'M12 17h.01' } },
      ],
      'folder': [
        { tag: 'path', attrs: { d: 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z' } },
      ],
      'chevron-right': [{ tag: 'path', attrs: { d: 'm9 18 6-6-6-6' } }],
      'chevron-down': [{ tag: 'path', attrs: { d: 'm6 9 6 6 6-6' } }],
      'panel-right': [
        { tag: 'rect', attrs: { x: 3, y: 4, width: 18, height: 16, rx: 2 } },
        { tag: 'path', attrs: { d: 'M15 4v16' } },
      ],
      'arrow-left': [
        { tag: 'path', attrs: { d: 'm12 19-7-7 7-7' } },
        { tag: 'path', attrs: { d: 'M19 12H5' } },
      ],
      'refresh': [
        { tag: 'path', attrs: { d: 'M21 12a9 9 0 1 1-3-6.7L21 8' } },
        { tag: 'path', attrs: { d: 'M21 3v5h-5' } },
      ],
      'eye': [
        { tag: 'path', attrs: { d: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z' } },
        { tag: 'circle', attrs: { cx: 12, cy: 12, r: 3 } },
      ],
      'activity': [{ tag: 'path', attrs: { d: 'M22 12h-4l-3 9L9 3l-3 9H2' } }],
      'layers': [
        { tag: 'path', attrs: { d: 'm12 2 9 5-9 5-9-5 9-5Z' } },
        { tag: 'path', attrs: { d: 'm3 12 9 5 9-5' } },
        { tag: 'path', attrs: { d: 'm3 17 9 5 9-5' } },
      ],
      'pen': [
        { tag: 'path', attrs: { d: 'M12 20h9' } },
        { tag: 'path', attrs: { d: 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z' } },
      ],
      'lock': [
        { tag: 'rect', attrs: { x: 3, y: 11, width: 18, height: 11, rx: 2 } },
        { tag: 'path', attrs: { d: 'M7 11V7a5 5 0 0 1 10 0v4' } },
      ],
    }

    /**
     * Draw one glyph.
     * @param props - `name` selects the glyph, `size` and `strokeWidth` tune it.
     * @returns the svg element, or null for an unknown name.
     */
    function Icon({ name, size = 13, strokeWidth = 2, className = undefined, style = undefined }) {
      const glyph = ICON_GLYPHS[name]
      if (glyph === undefined) return null
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': true,
        fill: 'none', stroke: 'currentColor', strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round',
        className, style: { display: 'block', flex: 'none', ...(style ?? {}) },
      }, glyph.map((shape, index) => h(shape.tag, { key: index, ...shape.attrs })))
    }
