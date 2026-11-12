// Ported from rera/flagstage infrastructure/026-custom-domains/template.yaml @ 27a19bd0c040d40ce2356d6758bb7127657ab782
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
