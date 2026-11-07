# -*- coding: utf-8 -*-
import html, sys, re
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from _hf2c_1107_data1 import P1
from _hf2c_1107_data2 import P2
from _hf2c_1107_data3 import P3
D = "2026-11-06"
P = P1 + P2 + P3
P.sort(key=lambda p: -p[2])
E = html.escape
cols = [("#f1efe8","#c2c0b6"),("#e6f1fb","#85b7eb"),("#faeeda","#ef9f27"),("#eaf3de","#97c459"),("#fbeaf0","#d4537e")]
def svg(n, boxes):
    w=96; g=16; x0=(560-(5*w+4*g))//2
    s='<svg viewBox="0 0 560 240" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="%s"><defs><marker id="hf%d" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto"><polygon points="0 0, 9 3.5, 0 7" fill="#6b6a63"/></marker></defs>'%(E(" → ".join(boxes)),n)
    for i,b in enumerate(boxes):
        x=x0+i*(w+g); f,st=cols[i]
        words=b.split(" ")
        if len(b)>12 and len(words)>1:
            h=len(words)//2+(len(words)%2); l1=" ".join(words[:h]); l2=" ".join(words[h:])
        else: l1,l2=b,""
        s+='<rect x="%d" y="70" width="%d" height="84" rx="8" fill="%s" stroke="%s"/><text x="%d" y="106" text-anchor="middle" font-size="10" font-weight="700" fill="#3a3934">%s</text>'%(x,w,f,st,x+w//2,E(l1))
        if l2: s+='<text x="%d" y="122" text-anchor="middle" font-size="10" font-weight="700" fill="#3a3934">%s</text>'%(x+w//2,E(l2))
        s+='<text x="%d" y="146" text-anchor="middle" font-size="8" fill="#6b6a63">%d</text>'%(x+w//2,i+1)
        if i<4: s+='<line x1="%d" y1="112" x2="%d" y2="112" stroke="#6b6a63" stroke-width="1.5" marker-end="url(#hf%d)"/>'%(x+w+1,x+w+g-1,n)
    return s+'</svg>'
N=len(P)
out=['<!-- ============ 2c. HUGGING FACE DAILY PAPERS ============ -->','<h2><span class="en">2c. Hugging Face Daily Papers — all of today&rsquo;s picks</span><span class="ko">2c. Hugging Face 데일리 논문 — 오늘의 전체 선정작</span><span class="tag">HF daily</span></h2>',
'<p class="lede"><span class="en">All %d papers on the <a href="https://huggingface.co/papers/date/%s" target="_blank" rel="noopener">Hugging Face Daily Papers page for %s</a>, sorted by upvotes (the 2026-11-07 page has no papers yet, so this is the latest available date).</span><span class="ko"><a href="https://huggingface.co/papers/date/%s" target="_blank" rel="noopener">%s Hugging Face 데일리 논문 페이지</a>의 전체 %d편을 추천 수 순으로 정리했다(2026-11-07 페이지에는 아직 논문이 없어 가장 최근 날짜를 사용).</span></p>'%(N,D,D,D,D,N),'']
def f(l,a,b): return '<p class="pf"><b><span class="en">%s</span><span class="ko">%s</span></b><span class="en">%s</span><span class="ko">%s</span></p>'%(l[0],l[1],E(a),E(b))
for n,p in enumerate(P,1):
    i,t,u,tp,bx,pe,pk,me,mk,re_,rk,se,sk,de,dk=p
    out.append('<details class="paper">\n  <summary><span class="ptitle">%s</span><span class="pill p-blue">%s</span><span class="pill p-amber">▲%d</span><span class="date">arXiv:%s</span></summary>\n  <div class="pbody">\n    <a class="plink" href="https://arxiv.org/abs/%s" target="_blank" rel="noopener">arxiv.org/abs/%s &rarr;</a>\n    %s\n    %s\n    %s\n    %s\n    <div class="pdiagram">\n      <div class="dt"><span class="en">%s</span><span class="ko">%s</span></div>\n      %s\n      <div class="pcap"><span class="en">Original schematic redrawn from the abstract, not a figure from the paper (<a href="https://arxiv.org/abs/%s" target="_blank" rel="noopener">arXiv:%s</a>).</span><span class="ko">초록을 바탕으로 새로 그린 개념도이며 논문의 그림이 아니다(<a href="https://arxiv.org/abs/%s" target="_blank" rel="noopener">arXiv:%s</a>).</span></div>\n    </div>\n  </div>\n</details>\n'%(E(t),E(tp),u,i,i,i,f(("Problem","문제 정의"),pe,pk),f(("Method","방법"),me,mk),f(("Results","결과"),re_,rk),f(("Summary","요약"),se,sk),E(de),E(dk),svg(n,bx),i,i,i,i))
F=sys.argv[1]; s=open(F,encoding='utf-8').read()
M='<!-- HF_DAILY_INSERT: section 2c (Hugging Face Daily Papers) is added by the 12:36 KST scheduled run -->'
assert M in s
s=s.replace(M,"\n".join(out))
a='  <div class="bar-row"><span class="lbl"><span class="en">Engine updates</span>'
row='  <div class="bar-row"><span class="lbl"><span class="en">HF daily papers</span><span class="ko">HF 데일리 논문</span></span><span class="track"><span class="fill" style="width:100%%;background:var(--teal-bd,var(--blue-bd))"></span></span><span class="val">%d</span></div>\n'%N
assert a in s; s=s.replace(a,row+a,1)
# soften deferred notes
s=s.replace('<p class="cap" style="margin:12px 0 0"><span class="en">Hugging Face daily papers (section 2c) are added in the afternoon update.</span><span class="ko">Hugging Face 데일리 논문(2c 섹션)은 오후 업데이트에서 추가된다.</span></p>','<p class="cap" style="margin:12px 0 0"><span class="en">Section 2c (Hugging Face daily papers) was added in the afternoon update.</span><span class="ko">2c 섹션(Hugging Face 데일리 논문)은 오후 업데이트에서 추가되었다.</span></p>')
s=s.replace('(section 2c) are added in the afternoon update','(section 2c) were added in the afternoon update')
s=re.sub(r'Hugging Face 데일리 논문\(2c 섹션\)은 오후 업데이트에서 추가된다\.','Hugging Face 데일리 논문(2c 섹션)은 오후 업데이트에서 추가되었다.',s)
open(F,'w',encoding='utf-8').write(s); print("ok",N)
