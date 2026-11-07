(function () {
  "use strict";
  var params = new URLSearchParams(window.location.search);
  if (params.get("museumEmbed") !== "1") return;

  var legacyExhibit = !!window.TLROOM;
  var embed = window.YCMuseumEmbed && typeof window.YCMuseumEmbed === "object" ? window.YCMuseumEmbed : {};
  embed.active = true;
  embed.room = params.get("museumRoom") || "main";
  embed.guide = params.get("museumGuide") || "";
  window.YCMuseumEmbed = embed;

  function hide(el) {
    if (!el || el.dataset.museumHidden === "1") return;
    el.dataset.museumHidden = "1";
    el.hidden = true;
    el.style.setProperty("display", "none", "important");
  }
  function cleanExternalNavigation(root) {
    var base = root && root.querySelectorAll ? root : document;
    base.querySelectorAll(".ycbar .nav,.bar .nav,.topbar .nav,.castdock,.cst-root").forEach(hide);
    if (!legacyExhibit) base.querySelectorAll(".rguide,.roomhud").forEach(hide);
    base.querySelectorAll("a[href]").forEach(function (a) {
      var u;
      try { u = new URL(a.getAttribute("href"), location.href); } catch (e) { return; }
      var name = u.pathname.split("/").pop();
      var externalHall = /^(?:index|map|evidence|h[1-8][a-z0-9_-]*|m[1-8][a-z0-9_-]*|engine-bench)(?:\.html)?$/i.test(name);
      var otherRoom = u.searchParams.get("museumRoom");
      if ((externalHall && u.pathname !== location.pathname) || (otherRoom && otherRoom !== embed.room)) hide(a);
    });
  }
  function hideRoomNavigation() {
    if (legacyExhibit) return; // H1 exhibit story/toy/lab tabs are part of the same learning room.
    document.querySelectorAll(".d6arch,.h4rail,.tabbar,.rail,.path,.progressline,[data-go]").forEach(hide);
  }
  function syncLegacyGuide() {
    if (!legacyExhibit || !embed.guide) return;
    var guide = ({ shen:"wu", he:"ce", tao:"pi" })[embed.guide] || "wu";
    try { localStorage.setItem("tlab.guide", guide); } catch (e) {}
    var button = document.querySelector('.rguide .rgf[data-g="' + guide + '"]');
    if (button) button.click();
  }
  function activateRoom() {
    syncLegacyGuide();
    if (embed.room === "main") return;
    var selector = document.querySelector(".h4rail") ? ".room[data-l]"
      : document.querySelector(".d6arch,.path") ? ".zone[data-l]" : ".layer[data-l]";
    var sections = Array.from(document.querySelectorAll(selector));
    if (!sections.length) return;
    var target = sections.find(function (s) { return s.getAttribute("data-l") === embed.room; });
    if (!target) { embed.error = "unknown-room"; return; }
    /* Invoke the page's normal controller first so lazy canvases/calculations initialize. */
    var roomButton = Array.from(document.querySelectorAll("[data-l]" )).find(function (b) {
      return b.getAttribute("data-l") === embed.room && /^(BUTTON|A)$/.test(b.tagName);
    });
    if (roomButton) roomButton.click();
    sections.forEach(function (s) { s.classList.toggle("on", s === target); });
    hideRoomNavigation();
    cleanExternalNavigation(document);
  }

  cleanExternalNavigation(document);
  document.addEventListener("DOMContentLoaded", activateRoom, { once: true });
  var observer = new MutationObserver(function(records){records.forEach(function(r){r.addedNodes.forEach(function(n){if(n.nodeType===1){cleanExternalNavigation(n);if(embed.room!=="main")hideRoomNavigation();}});});});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener("keydown", function (event) {
    if (event.target && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
    if (event.key === "Escape") {
      event.preventDefault(); event.stopImmediatePropagation();
      window.parent.postMessage({ type: "yc-museum-back" }, "*");
    }
  }, true);
})();
