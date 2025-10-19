# Changelog

## [1.1.2] – 2025-10-19
### Added
- Keyboard loop for ergonomic navigation:
  - **Enter** in query runs search and focuses the first result link.
  - **Arrow Up/Down** cycles through results.
  - **Enter** on a result opens it in a new tab.
  - **Esc** returns focus to the query field.
- Default state improvements:
  - `Tags Only` checkbox is now pre‑selected when popup opens.
  - Query input auto‑focused on popup open.

### Changed
- Search results now focus the first link instead of the container, enabling proper keyboard navigation.
- Saved searches panel renders more consistently with run/delete buttons.

### Fixed
- Prevented duplicate saved searches with identical query + options.
- Autocomplete suggestions now reset active index correctly when hidden.

## [v1.1.1-beta] - 2025-10-17
### Added
- Autocomplete dropdown for `tag:` queries (keyboard + mouse support).
- Tag panel listing all tags with counts, click-to-search.
- Clicking or selecting tags appends with `AND` instead of overwriting.
- Tags displayed without the `tag:` prefix for consistency.

### Notes
- Marked as **Beta** pending full testing.
- Search remains case-insensitive and accent-insensitive, but results echo the query terms as entered.

## [v1.1.0] - 2025-10-16
### Added
- Boolean expression parser with support for `AND`, `OR`, `NOT`, and parentheses.
- Regex search mode (`re:` prefix or `/pattern/` syntax).
- `tagsOnly` mode to restrict searches to explicit `tag:` entries in bookmark descriptions.
- Saved searches with persistent storage and quick re-run/delete buttons.

### Changed
- Improved normalization: case-insensitive and diacritic-insensitive matching.
- Cleaner UI for results with matched terms highlighted.

## [v1.0.0] - 2025-10-16
### Added
- Initial release of the extension.
- Basic bookmark traversal and keyword search across title, URL, and description.
- Simple popup UI with query box and results list.
