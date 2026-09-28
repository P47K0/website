#!/usr/bin/env python3
"""
Exports the homepage content marked with data-md-* attributes as Markdown,
the same content that about.md (https://blog.koorevaar.com/about.md) serves.

Export is opt-in: only elements inside a data-md-section are read, and only
the marked ones. Everything unmarked (nav, buttons, chat widget, Turnstile,
live counters) is ignored. See the "about.md export markers" section in
README.md for the vocabulary.

Also validates the markers and fails (exit 1) on:
  - an unknown data-md-* attribute (typo guard)
  - a marker outside a section, a nested section or item, a section without
    data-md-title, an item without exactly one title, or a marker in the
    wrong place (tag/meta/title outside an item, stat inside one)
  - a stat without a label or value, or a link that isn't an http(s) URL
  - a stat value that no longer matches the counter script that renders it

Usage: python3 scripts/export_about_md.py [path/to/index.html] > about.md
Stdlib only, so CI needs nothing but python3.
"""
import os
import re
import sys
from datetime import date
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

BASE_URL = "https://www.koorevaar.com/"
MARKERS = {"section", "title", "item", "meta", "text", "tag", "link", "stat", "label", "value"}
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}
SKIP_TEXT = {"script", "style", "svg"}
ITEM_PARTS = ("title", "meta", "text", "tag", "link")


class Node:
    def __init__(self, tag, attrs, parent, line):
        self.tag, self.attrs, self.parent, self.line = tag, attrs, parent, line
        self.children = []

    def md(self, name):
        return f"data-md-{name}" in self.attrs

    def iter(self):
        for child in self.children:
            if isinstance(child, Node):
                yield child
                yield from child.iter()


class TreeBuilder(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("#root", {}, None, 0)
        self.cur = self.root

    def handle_starttag(self, tag, attrs):
        node = Node(tag, {k: (v or "") for k, v in attrs}, self.cur, self.getpos()[0])
        self.cur.children.append(node)
        if tag not in VOID:
            self.cur = node

    def handle_startendtag(self, tag, attrs):
        self.cur.children.append(Node(tag, {k: (v or "") for k, v in attrs}, self.cur, self.getpos()[0]))

    def handle_endtag(self, tag):
        node = self.cur
        while node is not self.root and node.tag != tag:
            node = node.parent
        if node is not self.root:
            self.cur = node.parent

    def handle_data(self, data):
        self.cur.children.append(data)


def clean(s):
    return re.sub(r"\s+", " ", s.replace("\xa0", " ")).strip()


def resolve(href):
    url = urljoin(BASE_URL, href)
    return url if urlparse(url).scheme in ("http", "https") and not href.startswith("#") else None


def text_of(node, inline_links=False):
    parts = []
    for child in node.children:
        if isinstance(child, str):
            parts.append(child)
        elif child.tag in SKIP_TEXT:
            continue
        elif child.tag == "br":
            parts.append(" ")
        elif inline_links and child.tag == "a" and resolve(child.attrs.get("href", "")):
            parts.append(f"[{clean(text_of(child))}]({resolve(child.attrs['href'])})")
        else:
            parts.append(text_of(child, inline_links))
    return "".join(parts)


def link_md(node):
    label = clean(text_of(node)).rstrip("→").strip()
    return f"[{label}]({resolve(node.attrs.get('href', ''))})"


class Exporter:
    def __init__(self, html):
        builder = TreeBuilder()
        builder.feed(html)
        self.root = builder.root
        self.errors = []

    def error(self, node, msg):
        self.errors.append(f"line {node.line}: <{node.tag}> {msg}")

    def validate(self):
        for node in self.root.iter():
            for attr in node.attrs:
                if attr.startswith("data-md-") and attr[len("data-md-"):] not in MARKERS:
                    self.error(node, f"unknown marker {attr}")
            # On a section, data-md-title is the heading text, not the title role.
            roles = [m for m in MARKERS - {"label", "value"} if node.md(m)
                     and not (m == "title" and node.md("section"))]
            if len(roles) > 1:
                self.error(node, f"has more than one role: {', '.join(sorted(roles))}")
            if not roles:
                if node.md("label") or node.md("value"):
                    self.error(node, "data-md-label/data-md-value only belong on a data-md-stat")
                continue
            role = roles[0]
            section = self.closest(node, "section")
            item = self.closest(node, "item")
            if role == "section":
                if section:
                    self.error(node, "section nested in another section")
                if not clean(node.attrs.get("data-md-title", "")):
                    self.error(node, "section needs a non-empty data-md-title")
                continue
            if not section:
                self.error(node, f"data-md-{role} outside any data-md-section")
            if role == "item":
                if item:
                    self.error(node, "item nested in another item")
                titles = [n for n in node.iter() if n.md("title")]
                if len(titles) != 1:
                    self.error(node, f"item needs exactly one data-md-title, found {len(titles)}")
            elif role in ("title", "meta", "tag") and not item:
                self.error(node, f"data-md-{role} outside a data-md-item")
            elif role == "stat":
                if item:
                    self.error(node, "stat inside an item")
                label, value = clean(node.attrs.get("data-md-label", "")), clean(node.attrs.get("data-md-value", ""))
                if not label or not value or value in ("—", "-"):
                    self.error(node, "stat needs a non-empty data-md-label and a build-time data-md-value")
            elif role == "link" and not resolve(node.attrs.get("href", "")):
                self.error(node, "data-md-link needs an http(s) href")
            if role in ("title", "meta", "text", "tag", "link") and not clean(text_of(node)):
                self.error(node, f"data-md-{role} has no text")

    @staticmethod
    def closest(node, role):
        node = node.parent
        while node is not None:
            if isinstance(node, Node) and node.md(role):
                return node
            node = node.parent
        return None

    def check_stat_sources(self, public_dir):
        """Stat values are duplicated from the counter scripts; fail when they drift."""
        stats = {}
        for node in self.root.iter():
            if node.md("stat"):
                for inner in node.iter():
                    if inner.attrs.get("id"):
                        stats[inner.attrs["id"]] = node

        def expect(counter_id, value, source):
            node = stats.get(counter_id)
            if node is not None and clean(node.attrs.get("data-md-value", "")) != value:
                self.error(node, f"data-md-value for #{counter_id} is "
                                 f"{node.attrs.get('data-md-value')!r} but {source} renders {value!r}")

        def read(name):
            with open(os.path.join(public_dir, name), encoding="utf-8") as f:
                return f.read()

        for counter_id, number in re.findall(r'animate\("([\w-]+)",\s*(\d+)', read("static-stat-counters.js")):
            expect(counter_id, number, "static-stat-counters.js")

        start_dates = [
            ("years-it-count", "tenure-counter.js", r"yearsInIT = fullYearsSince\(new Date\((\d{4}),\s*(\d{1,2})"),
            ("years-azure-count", "tenure-counter.js", r"yearsAzure = fullYearsSince\(new Date\((\d{4}),\s*(\d{1,2})"),
            ("ai-dev-months-count", "ai-dev-counter.js", r"fullMonthsSince\(new Date\((\d{4}),\s*(\d{1,2})"),
        ]
        for counter_id, script, pattern in start_dates:
            found = re.search(pattern, read(script))
            if not found:
                self.errors.append(f"{script}: start date for #{counter_id} not found; update this check")
                continue
            since = date(int(found.group(1)), int(found.group(2)) + 1, 1).strftime("%B %Y")
            expect(counter_id, since, script)

        projects = sum(1 for n in self.root.iter() if "data-project" in n.attrs)
        expect("side-project-count", str(projects), "side-project-counter.js (count of [data-project])")

    def render(self):
        title = next((clean(text_of(n)) for n in self.root.iter() if n.tag == "title"), "About")
        out = [f"# {title}"]
        for section in (n for n in self.root.iter() if n.md("section")):
            blocks = [("block", f"## {clean(section.attrs['data-md-title'])}")]
            self.render_section(section, blocks)
            out.append(join_blocks(blocks))
        return "\n\n".join(out) + "\n"

    def render_section(self, node, blocks):
        for child in node.children:
            if not isinstance(child, Node):
                continue
            if child.md("item"):
                blocks.extend(render_item(child))
            elif child.md("text"):
                blocks.append(("block", clean(text_of(child, inline_links=True))))
            elif child.md("stat"):
                blocks.append(("li:stat", f"- {clean(child.attrs['data-md-label'])}: {clean(child.attrs['data-md-value'])}"))
            elif child.md("link"):
                blocks.append(("li:link", f"- {link_md(child)}"))
            else:
                self.render_section(child, blocks)


def render_item(item):
    parts = {p: [] for p in ITEM_PARTS}
    for node in item.iter():
        for p in ITEM_PARTS:
            if node.md(p):
                parts[p].append(link_md(node) if p == "link" else clean(text_of(node, inline_links=(p == "text"))))
    title = parts["title"][0] if parts["title"] else ""
    tags = " · ".join(parts["tag"])
    links = " · ".join(parts["link"])
    if not parts["text"]:
        # Compact item (skill group, certification, fact row): one bullet.
        detail = " · ".join(filter(None, parts["meta"] + [tags]))
        line = f"- **{title}**" + (f": {detail}" if detail else "") + (f" ({links})" if links else "")
        return [("li:compact", line)]
    blocks = [("block", f"### {title}")]
    blocks += [("block", f"*{m}*") for m in parts["meta"]]
    blocks += [("block", t) for t in parts["text"]]
    if tags:
        blocks.append((f"li:{id(item)}", f"- Tags: {tags}"))
    if links:
        blocks.append((f"li:{id(item)}", f"- Links: {links}"))
    return blocks


def join_blocks(blocks):
    # Kinds are "block" or "li:<group>"; list lines only join into one list
    # when they share a group, so an item's Links list and the compact items
    # after it stay separate lists.
    out = blocks[0][1]
    for (prev_kind, _), (kind, text) in zip(blocks, blocks[1:]):
        out += ("\n" if prev_kind == kind != "block" else "\n\n") + text
    return out


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "public", "index.html")
    with open(path, encoding="utf-8") as f:
        exporter = Exporter(f.read())
    exporter.validate()
    exporter.check_stat_sources(os.path.dirname(os.path.abspath(path)))
    if exporter.errors:
        print("about.md export markers are invalid:", file=sys.stderr)
        for e in exporter.errors:
            print(f"  {e}", file=sys.stderr)
        sys.exit(1)
    sys.stdout.write(exporter.render())


if __name__ == "__main__":
    main()
