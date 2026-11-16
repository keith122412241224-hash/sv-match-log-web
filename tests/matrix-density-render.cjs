// Reverse only the reviewed layout markup for earlier exact-render regression tests.
// All text, rates, counts, colors, icons, selectors and export controls stay exact.
function beforeDensity(html){
  return html
    .replace('matrix-scrollbar min-w-0 overflow-x-auto rounded-md border border-slate-200 bg-white [--matrix-cell-width:128px] [--matrix-label-width:168px] lg:[--matrix-cell-width:88px] lg:[--matrix-label-width:144px]','matrix-scrollbar overflow-x-auto rounded-md border border-slate-200 bg-white')
    .replace(/class="w-full bg-white p-4" style="min-width:calc\(var\(--matrix-label-width\) \+ \d+ \* var\(--matrix-cell-width\) \+ 2rem\)"/,'class="inline-block min-w-full bg-white p-4"')
    .replace('class="w-full table-fixed border-collapse text-center text-sm"','class="min-w-[760px] border-collapse text-center text-sm"')
    .replace(/<colgroup><col style="width:var\(--matrix-label-width\)"\/>(?:<col\/>)+<\/colgroup>/,'')
    .replaceAll('border border-slate-200 bg-slate-50 px-2 py-2 text-left','border border-slate-200 bg-slate-50 px-3 py-2 text-left')
    .replaceAll('border border-slate-200 bg-slate-50 px-1.5 py-2 text-muted','border border-slate-200 bg-slate-50 px-3 py-2 text-muted')
    .replaceAll('<span class="min-w-0 max-w-full [overflow-wrap:anywhere]">','<span>')
    .replace(/<div class="flex min-w-0 items-center gap-2"><span class="shrink-0">([\s\S]*?)<\/span><span class="min-w-0 font-semibold \[overflow-wrap:anywhere\]">([^<]*)<\/span><\/div>/g,'<span class="inline-flex min-w-0 items-center gap-2">$1<span class="truncate font-semibold text-sm">$2</span></span>')
    .replaceAll('h-16 border border-slate-200 px-1.5 py-2','h-16 min-w-32 border border-slate-200 px-2 py-2')
    .replaceAll('<span class="text-xs [overflow-wrap:anywhere]">','<span class="text-xs">');
}
module.exports={beforeDensity};
