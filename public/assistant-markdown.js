/**
 * Renders the assistant's answers (a small Markdown subset) into a DOM
 * element. Shared by the chat widget (assistant-widget.js) and the homepage
 * "recently answered" box (recent-answers.js), loaded before both. Plain JS,
 * no build step. Adds the `aw-md` class to the element; the callers style it.
 */
(function () {
  // The assistant answers in a small Markdown subset (gemma-4 does that by
  // default): **bold**, *italic*, `code`, "- " / "* " bullet lists, "#"
  // headings (shown as bold) and paragraphs. Built from DOM nodes, never
  // innerHTML, so nothing the model (or a chunk it quotes) writes can inject
  // markup. Anything else, links included, stays literal text.
  function appendInline(parent, text) {
    var re = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\s][^*\n]*\*(?![*\w])|_[^_\s][^_\n]*_(?![_\w]))/g;
    var last = 0, m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
      var tok = m[0], node;
      if (tok.charAt(0) === '`') {
        node = document.createElement('code'); node.textContent = tok.slice(1, -1);
      } else if (tok.indexOf('**') === 0) {
        node = document.createElement('strong'); appendInline(node, tok.slice(2, -2));
      } else {
        node = document.createElement('em'); appendInline(node, tok.slice(1, -1));
      }
      parent.appendChild(node);
      last = m.index + tok.length;
    }
    if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
  }

  function renderMarkdown(el, text) {
    el.classList.add('aw-md');
    var list = null, para = null;
    text.split('\n').forEach(function (raw) {
      var line = raw.replace(/\s+$/, '');
      var item = /^\s*[-*+]\s+(.*)$/.exec(line);
      if (item) {
        para = null;
        if (!list) { list = document.createElement('ul'); el.appendChild(list); }
        var li = document.createElement('li');
        appendInline(li, item[1]);
        list.appendChild(li);
        return;
      }
      list = null;
      if (line.trim() === '') { para = null; return; }
      var heading = /^\s*#{1,6}\s+(.*)$/.exec(line);
      if (!para || heading) {
        para = document.createElement('p');
        el.appendChild(para);
      } else {
        para.appendChild(document.createElement('br'));
      }
      if (heading) {
        var b = document.createElement('strong');
        appendInline(b, heading[1]);
        para.appendChild(b);
        para = null;
      } else {
        appendInline(para, line.trim());
      }
    });
  }

  window.renderAssistantMarkdown = renderMarkdown;
})();
