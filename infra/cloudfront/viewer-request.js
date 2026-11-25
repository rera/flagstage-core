// Ported from rera/flagstage infrastructure/026-custom-domains/template.yaml @ 27a19bd0c040d40ce2356d6758bb7127657ab782
// Hostname keys have no slash. Redirect keys are the hostname plus the path.
// A query string is part of the key, sorted and encoded, so /?p=ID matches.
import cf from "cloudfront";
var kvsHandle = cf.kvs();

function notFound() {
  return {
    statusCode: 404,
    statusDescription: "Not Found",
    headers: {
      "content-type": { value: "text/plain; charset=utf-8" }
    },
    body: "Not Found"
  };
}

function moved(target) {
  return {
    statusCode: 301,
    statusDescription: "Moved Permanently",
    headers: {
      location: { value: target }
    }
  };
}

function canonicalQuery(qs) {
  if (!qs) return "";
  var pairs = [];
  var names = Object.keys(qs);
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    var entry = qs[name];
    if (!entry) continue;
    if (entry.multiValue && entry.multiValue.length) {
      for (var j = 0; j < entry.multiValue.length; j++) {
        var item = entry.multiValue[j];
        pairs.push([name, item && item.value != null ? String(item.value) : ""]);
      }
    } else {
      pairs.push([name, entry.value != null ? String(entry.value) : ""]);
    }
  }
  pairs.sort(function (left, right) {
    if (left[0] < right[0]) return -1;
    if (left[0] > right[0]) return 1;
    if (left[1] < right[1]) return -1;
    if (left[1] > right[1]) return 1;
    return 0;
  });
  var parts = [];
  for (var k = 0; k < pairs.length; k++) {
    parts.push(encodeURIComponent(pairs[k][0]) + "=" + encodeURIComponent(pairs[k][1]));
  }
  return parts.join("&");
}

async function redirectTarget(host, path, qs) {
  var query = canonicalQuery(qs);
  if (query) {
    try {
      var specific = await kvsHandle.get(host + path + "?" + query);
      if (specific) return specific;
    } catch (err) {
      // A missing key rejects. Fall through to the path, then to the file.
    }
  }
  try {
    return await kvsHandle.get(host + path);
  } catch (err) {
    return "";
  }
}

async function handler(event) {
  var request = event.request;
  var hostHeader = request.headers.host;
  if (!hostHeader || !hostHeader.value) {
    return notFound();
  }
  var host = hostHeader.value.toLowerCase();
  var colon = host.indexOf(":");
  if (colon !== -1) {
    host = host.substring(0, colon);
  }
  var prefix;
  try {
    prefix = await kvsHandle.get(host);
  } catch (err) {
    return notFound();
  }
  if (!prefix) {
    return notFound();
  }
  if (prefix.charAt(prefix.length - 1) !== "/") {
    prefix = prefix + "/";
  }
  var uri = request.uri;
  try {
    uri = decodeURIComponent(uri);
  } catch (err) {
    return notFound();
  }
  if (uri.indexOf("\\") !== -1) {
    return notFound();
  }
  var parts = uri.split("/");
  for (var i = 0; i < parts.length; i++) {
    if (parts[i] === "." || parts[i] === "..") {
      return notFound();
    }
  }
  var path = uri || "/";
  if (path.charAt(0) !== "/") path = "/" + path;
  var target = await redirectTarget(host, path, request.querystring);
  if (target) return moved(target);
  if (uri === "/" || uri === "") {
    request.uri = "/" + prefix + "index.html";
    return request;
  }
  if (uri.charAt(0) === "/") {
    uri = uri.substring(1);
  }
  if (uri.charAt(uri.length - 1) === "/") {
    request.uri = "/" + prefix + uri + "index.html";
    return request;
  }
  var lastSlash = uri.lastIndexOf("/");
  var lastSeg = lastSlash === -1 ? uri : uri.substring(lastSlash + 1);
  if (lastSeg.indexOf(".") === -1) {
    request.uri = "/" + prefix + uri + "/index.html";
    return request;
  }
  request.uri = "/" + prefix + uri;
  return request;
}
