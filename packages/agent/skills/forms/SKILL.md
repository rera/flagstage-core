---
name: forms
description: "Use when adding or changing a contact, quote, or other lead form."
---

# Lead forms

The published site is static. The form posts to this app.

```html
<form method="post" action="/f/{siteId}/{formKey}">
  <input type="text" name="website" tabindex="-1" autocomplete="off" />
  <input name="name" />
  <input name="email" type="email" />
  <textarea name="message"></textarea>
</form>
```

`formKey` is a short slug unique on the site, such as `contact`. Leave `website` empty; it is a honeypot. Do not post to a third-party form host.
