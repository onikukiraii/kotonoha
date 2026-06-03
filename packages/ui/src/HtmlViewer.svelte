<script lang="ts">
  import DOMPurify from 'dompurify'

  interface Props {
    html?: string
  }

  let { html = '' }: Props = $props()

  const sanitizeConfig = {
    WHOLE_DOCUMENT: true,
    FORCE_BODY: true,
    ADD_TAGS: ['style', 'link', 'meta'],
    ADD_ATTR: ['style', 'class', 'id', 'target', 'rel'],
  }

  const anchorHandlerScript = `<script>
document.addEventListener('click', function(e) {
  var a = e.target.closest('a[href^="#"]');
  if (!a) return;
  e.preventDefault();
  var id = a.getAttribute('href').slice(1);
  if (!id) { window.scrollTo({top: 0, behavior: 'smooth'}); return; }
  var target = document.getElementById(id);
  if (target) target.scrollIntoView({behavior: 'smooth'});
});
<\/script>`

  let sanitizedHtml = $derived(DOMPurify.sanitize(html, sanitizeConfig) + anchorHandlerScript)
</script>

<div class="html-viewer">
  <iframe
    srcdoc={sanitizedHtml}
    sandbox="allow-scripts"
    title="HTML Preview"
  ></iframe>
</div>

<style>
  .html-viewer {
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .html-viewer iframe {
    width: 100%;
    height: 100%;
    border: none;
    background: #fff;
  }
</style>
