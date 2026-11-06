# -*- coding: utf-8 -*-
import html, sys, re
D = "2026-11-06"
P = [
("2611.07854","Towards Foundation Decision Models: Drex",6,"decision models",["User question + options","State: doc / record / context","Decision model (no decoding)","Option probabilities","Stable under reordering"],
"Long chain-of-thought LLMs reach high accuracy, but in production they give inconsistent answers, need output parsing, and add cost and latency.","긴 사고 사슬 LLM은 정확도가 높지만 실제 운영에서는 답이 일관되지 않고 출력 파싱이 필요하며 비용과 지연이 늘어난다.",
"Drex is a family of four open decision models (8B, 9B, 35B with 3B active, and 27B Max) that take a state such as a document, record or agent context plus questions, and return a probability distribution over options without autoregressive decoding. Training combines supervised fine-tuning, reinforcement learning from adjusted feedback (RLAF) and vision tuning, with consistency losses for robustness to option order.","Drex는 문서, 레코드, 에이전트 맥락 같은 상태와 질문을 받아 자기회귀 디코딩 없이 선택지에 대한 확률 분포를 돌려주는 공개 의사결정 모델 4종(8B, 9B, 활성 3B의 35B, 27B Max)이다. 학습은 지도 미세조정, 조정된 피드백 기반 강화학습(RLAF), 비전 튜닝을 결합하고, 선택지 순서에 대한 강건성을 위해 일관성 손실을 쓴다.",
"On Decision Index 0.4.1, Max sets a new state of the art among compared decision models (67.52 on the public suite vs. 60.70 for Jev 1.14.0). On Decision Bench v4 it is statistically tied with d3-turbo and GPT-6 Sol and trails Claude Opus 5.5 by 1.6 points, with the highest accuracy among decision models on DecideBench. Max answers a typical request in 183 ms, against about 2.0 s for GPT-6 Sol and 3.5 s for Claude Opus 5.5.","Decision Index 0.4.1에서 Max는 비교한 의사결정 모델 중 최고 성능을 새로 세웠다(공개 스위트 67.52, Jev 1.14.0은 60.70). Decision Bench v4에서는 d3-turbo, GPT-6 Sol과 통계적으로 동률이고 Claude Opus 5.5에는 1.6점 뒤지며, DecideBench에서는 의사결정 모델 중 정확도가 가장 높다. Max는 일반적인 요청에 183 ms가 걸려, GPT-6 Sol 약 2.0초, Claude Opus 5.5 약 3.5초보다 훨씬 빠르다.",
"Scoring options directly instead of generating a reasoning chain gives frontier-level decisions at a fraction of the latency, with stable outputs.","추론 사슬을 생성하는 대신 선택지를 직접 채점하면 지연을 크게 줄이면서 프런티어급 판단과 안정적인 출력을 얻을 수 있다.","Drex: decide without autoregressive decoding","Drex: 자기회귀 디코딩 없는 의사결정"),
("2611.00883","Random Is Almost Enough? Stable and Low-Cost Benchmark Compression via BestRand",1,"benchmark compression",["Full benchmark","Random subsets","Long-tailed error","BestRand selection","Stable small subset"],
"Benchmark compression evaluates models on a small subset that should closely match full-benchmark results, but random subsets occasionally produce very large estimation errors, so random sampling is unstable.","벤치마크 압축은 전체 벤치마크 결과와 가깝게 맞는 작은 부분집합으로 모델을 평가하지만, 무작위 부분집합은 가끔 매우 큰 추정 오차를 내 불안정하다.",
"The authors derive an analytical approximation of the error distribution when estimating full-benchmark scores from a subset: most subsets give small errors but a few give much larger ones (a long tail), and this instability persists as more models are evaluated. BestRand keeps the efficiency of random sampling while substantially cutting the high-error tail.","저자들은 부분집합으로 전체 벤치마크 점수를 추정할 때의 오차 분포를 해석적으로 근사한다. 대부분의 부분집합은 오차가 작지만 일부는 훨씬 커서 긴 꼬리가 생기며, 평가 모델이 늘어도 이 불안정성은 남는다. BestRand는 무작위 샘플링의 효율을 유지하면서 큰 오차의 꼬리를 크게 줄인다.",
"Validated on 70+ text, multimodal and agent benchmarks and extended to VLA evaluation, BestRand reduces high-error risk by 50.2% and estimation error by 16.4% on average versus competitive methods, at 51.3% of the construction cost. It also cuts out-of-distribution estimation error by 21.8% on average across score-range, model-family and temporal shifts.","텍스트, 멀티모달, 에이전트 벤치마크 70개 이상에서 검증하고 VLA 평가로 확장한 결과, BestRand는 경쟁 방법 대비 큰 오차 위험을 평균 50.2%, 추정 오차를 16.4% 줄이면서 구성 비용은 51.3%만 쓴다. 점수 범위, 모델 계열, 시간 이동에 걸친 분포 외 추정 오차도 평균 21.8% 줄인다.",
"A cheap, nearly random benchmark subset can be made stable by trimming the rare high-error draws.","거의 무작위인 값싼 벤치마크 부분집합도 드물게 나오는 큰 오차 추출을 걸러 내면 안정적으로 만들 수 있다.","BestRand: random subsets, trimmed error tail","BestRand: 무작위 부분집합, 잘라 낸 오차 꼬리"),
]
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
'<p class="lede"><span class="en">All %d papers on the <a href="https://huggingface.co/papers/date/%s" target="_blank" rel="noopener">Hugging Face Daily Papers page for %s</a>, sorted by upvotes.</span><span class="ko"><a href="https://huggingface.co/papers/date/%s" target="_blank" rel="noopener">%s Hugging Face 데일리 논문 페이지</a>의 전체 %d편을 추천 수 순으로 정리했다.</span></p>'%(N,D,D,D,D,N),'']
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
s=s.replace('<p class="cap" style="margin:12px 0 0"><span class="en">Hugging Face daily papers (section 2c) were added in the afternoon update.</span><span class="ko">Hugging Face 데일리 논문(2c 섹션)은 오후 업데이트에서 추가된다.</span></p>','<p class="cap" style="margin:12px 0 0"><span class="en">Section 2c (Hugging Face daily papers) was added in the afternoon update.</span><span class="ko">2c 섹션(Hugging Face 데일리 논문)은 오후 업데이트에서 추가되었다.</span></p>')
s=s.replace('Hugging Face daily papers (section 2c) were added in the afternoon update.','Hugging Face daily papers (section 2c) were added in the afternoon update.')
s=re.sub(r'Hugging Face 데일리 논문\(2c 섹션\)은 오후 업데이트에서 추가된다\.','Hugging Face 데일리 논문(2c 섹션)은 오후 업데이트에서 추가되었다.',s)
open(F,'w',encoding='utf-8').write(s); print("ok",N)
