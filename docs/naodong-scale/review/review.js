"use strict";
(() => {
  const bank = JSON.parse(document.getElementById("bank-data").textContent);
  const version = JSON.parse(document.getElementById("bank-version").textContent);
  const key = "nd-review:" + version;
  const ids = new Set(bank.map(r => r.id));
  const choices = {pending: "未审核", keep: "保留", revise: "修改", remove: "删除"};
  const byId = id => document.getElementById(id);
  const seed = JSON.parse(document.getElementById("review-seed").textContent);
  let opinions = Object.assign(Object.create(null), seed);
  function message(text) { byId("message").textContent = text; }
  function checkedReviews(rows) {
    if (!Array.isArray(rows) || rows.length > bank.length) throw Error("审核条目数量不正确");
    const result = Object.create(null), seen = new Set();
    for (const r of rows) {
      if (!r || !ids.has(r.id) || seen.has(r.id) || !Object.hasOwn(choices, r.decision) || typeof r.note !== "string" || r.note.length > 2000) {
        throw Error("含未知编号、重复编号、无效审核选择或过长备注");
      }
      seen.add(r.id);
      result[r.id] = {decision: r.decision, note: r.note};
    }
    return result;
  }
  try {
    const saved = localStorage.getItem(key);
    if (saved) opinions = checkedReviews(JSON.parse(saved));
  } catch { message("未能读取本地审核记录。你仍可审核并导出保存。"); }
  const choice = id => opinions[id]?.decision ?? "pending";
  const reviews = () => bank.map(r => ({id:r.id, decision:choice(r.id), note:opinions[r.id]?.note ?? ""}));
  function save() {
    try { localStorage.setItem(key, JSON.stringify(reviews())); }
    catch { message("浏览器未允许保存，请导出审核意见，避免丢失。"); }
  }
  function element(tag, text, cls) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (cls) el.className = cls;
    return el;
  }
  function stats(visible) {
    const done = bank.filter(r => choice(r.id) !== "pending").length;
    byId("summary").textContent = `显示 ${visible} / ${bank.length} 条 · 已审核 ${done} · 未审核 ${bank.length-done}`;
    byId("group-counts").textContent = ["说东西排序类", "说一句话类", "场景选择类"].map(t => `${t} ${bank.filter(r=>r.type===t).length}`).concat(`spicy ${bank.filter(r=>r.spicy).length} / 普通 ${bank.filter(r=>!r.spicy).length}`).join(" · ");
  }
  function render() {
    const q = byId("search").value.trim().toLowerCase(), group = byId("group").value, decision = byId("decision").value, scale = byId("spicy").value;
    const list = bank.filter(r => (!q || [r.id,r.localized.text,r.localized.low,r.localized.high].join(" ").toLowerCase().includes(q)) && (!group || r.type === group) && (!scale || (scale === "spicy" ? r.spicy : !r.spicy)) && (!decision || choice(r.id) === decision));
    byId("cards").replaceChildren();
    stats(list.length);
    for (const r of list) {
      const article = element("article");
      article.dataset.id = r.id;
      article.dataset.decision = choice(r.id);
      const meta = element("div", undefined, "meta");
      meta.append(element("span", r.id), element("span", r.type));
      if (r.spicy) meta.append(element("span", "spicy · 成人玩笑", "spicy"));
      article.append(meta, element("h2", r.localized.text));
      const endpoints = element("div", undefined, "endpoints");
      for (const [n, text] of [[1,r.localized.low],[10,r.localized.high]]) {
        const p = element("p"); p.append(element("b",String(n)),document.createTextNode(text)); endpoints.append(p);
      }
      article.append(endpoints);
      const buttons = element("div", undefined, "choice");
      buttons.setAttribute("aria-label", r.id + "审核选择");
      for (const [value,label] of Object.entries(choices)) {
        const button = element("button", label); button.type = "button"; button.dataset.value = value;
        button.setAttribute("aria-pressed",String(choice(r.id) === value));
        button.addEventListener("click", () => {
          opinions[r.id] = {...opinions[r.id], decision:value}; save(); article.dataset.decision=value;
          for (const b of buttons.children) b.setAttribute("aria-pressed",String(b.dataset.value===value));
          stats(list.length); if (byId("decision").value) render();
        });
        buttons.append(button);
      }
      const label = element("label", "想怎么改（选填）", "feedback"), note = element("textarea",undefined,"note");
      note.maxLength=2000; note.value=opinions[r.id]?.note ?? "";
      note.addEventListener("input",()=>{opinions[r.id]={...opinions[r.id],note:note.value};save();});
      label.append(note); article.append(buttons,label); byId("cards").append(article);
    }
    if (!list.length) byId("cards").append(element("p","没有符合条件的题目，请调整搜索或筛选条件。","empty"));
  }
  for (const name of ["search","group","spicy","decision"]) byId(name).addEventListener(name==="search"?"input":"change",render);
  byId("export").addEventListener("click",()=>{
    const payload={schema:"nd-review-v1",bankVersion:version,exportedAt:new Date().toISOString(),reviews:reviews()};
    const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}));
    const link=element("a"); link.href=url;link.download="脑洞量表_题卡审核意见.json";link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000); message("已导出当前意见。请保留下载的 JSON 文件。");
  });
  byId("import").addEventListener("click",()=>byId("file").click());
  byId("file").addEventListener("change",async()=>{
    const input=byId("file"),file=input.files[0]; if(!file)return;
    try {
      if (file.size>2000000) throw Error("文件不能超过 2 MB");
      const data=JSON.parse(await file.text());
      if (data.schema!=="nd-review-v1"||data.bankVersion!==version) throw Error("不是当前题库版本的审核文件");
      const next=checkedReviews(data.reviews);
      Object.assign(opinions,next);save();render();message("已导入当前版本的审核意见。");
    } catch(e) {message("导入失败："+e.message+"。原审核意见未改动。");}
    input.value="";
  });
  render();
})();
