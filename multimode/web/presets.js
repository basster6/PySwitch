// MIDI action catalogue for the key editor. Each preset inserts a list of operations.
// Sources: Neural DSP Quad Cortex mini manual (CorOS 4.1.1, "Incoming MIDI Messages"),
//          Anagram manual (KosmOS 1.17, "MIDI Support", p. 87-94).

const cc = (n, v = 127) => ({ cc: n, val: v });

const qcPresets = [
  { group: "풋스위치", items: [
    ...["A", "B", "C", "D"].map((s, i) => ({ name: `풋스위치 ${s} (Page I)`, ops: [cc(35 + i)] })),
    ...["A", "B", "C", "D"].map((s, i) => ({ name: `풋스위치 ${s} (Page II)`, ops: [cc(39 + i)] })),
    { name: "풋스위치 페이지 I", ops: [cc(64, 0)] },
    { name: "풋스위치 페이지 II", ops: [cc(64, 127)] },
  ]},
  { group: "씬", items: [
    ...["A", "B", "C", "D"].map((s, i) => ({ name: `씬 ${s} (Page I)`, ops: [cc(43, i)] })),
    ...["A", "B", "C", "D"].map((s, i) => ({ name: `씬 ${s} (Page II)`, ops: [cc(43, 4 + i)] })),
  ]},
  { group: "시스템", items: [
    { name: "탭 템포", ops: [cc(44)] },
    { name: "튜너 열기", ops: [cc(45, 127)] },
    { name: "튜너 닫기", ops: [cc(45, 0)] },
    { name: "튜너 토글 (상태 tun)", ops: [{ toggle: "tun" }, { cc: 45, val: "127 if tun else 0" }], needs: { tun: 0 } },
    { name: "Gig View 열기", ops: [cc(46, 127)] },
    { name: "Gig View 닫기", ops: [cc(46, 0)] },
    { name: "Gig View 토글 (상태 gig)", ops: [{ toggle: "gig" }, { cc: 46, val: "127 if gig else 0" }], needs: { gig: 0 } },
    { name: "모드 슬롯 1 (PRESET)", ops: [cc(47, 0)] },
    { name: "모드 슬롯 2 (SCENE)", ops: [cc(47, 1)] },
    { name: "모드 슬롯 3 (STOMP)", ops: [cc(47, 2)] },
    { name: "프리셋 불러오기 (My Presets, 0번)", ops: [cc(0, 0), cc(32, 1), { pc: 0 }] },
  ]},
  { group: "Looper X", items: [
    { name: "Looper 열기", ops: [cc(48, 0)] },
    { name: "Looper 닫기", ops: [cc(48, 127)] },
    { name: "녹음/오버더빙", ops: [cc(53)] },
    { name: "재생/정지", ops: [cc(54)] },
    { name: "언두/리두", ops: [cc(56)] },
    { name: "리버스", ops: [cc(55)] },
    { name: "하프 스피드", ops: [cc(51)] },
    { name: "원샷", ops: [cc(50)] },
    { name: "듀플리케이트", ops: [cc(49)] },
    { name: "펀치 인/아웃", ops: [cc(52)] },
  ]},
];

const anaPresets = [
  { group: "프리셋/뱅크", items: [
    { name: "프리셋 +", ops: [cc(105)] },
    { name: "프리셋 -", ops: [cc(106)] },
    { name: "프리셋 1 선택 (PC 1-126)", ops: [{ pc: 1 }] },
    { name: "뱅크 +", ops: [cc(103)] },
    { name: "뱅크 -", ops: [cc(104)] },
    { name: "뱅크 1 미리보기 (1-42)", ops: [cc(102, 1)] },
  ]},
  { group: "씬", items: [
    { name: "씬 +", ops: [cc(108)] },
    { name: "씬 -", ops: [cc(109)] },
    { name: "씬 1 선택 (1-126)", ops: [cc(107, 1)] },
    { name: "기본 씬", ops: [cc(107, 127)] },
  ]},
  { group: "모드/시스템", items: [
    { name: "Preset 모드", ops: [cc(85, 1)] },
    { name: "Stomp 모드", ops: [cc(85, 2)] },
    { name: "Scene 모드", ops: [cc(85, 3)] },
    { name: "튜너 열기/닫기", ops: [cc(86)] },
  ]},
  { group: "풋 바인딩 (Stomp)", items: [
    ...["A", "B", "C"].map((s, i) => {
      const v = "f" + s.toLowerCase();
      return { name: `Foot ${s} 토글 (상태 ${v})`, ops: [{ toggle: v }, { cc: 17 + i, val: `127 if ${v} else 0` }], needs: { [v]: 0 } };
    }),
    ...["A", "B", "C"].map((s, i) => ({ name: `Foot ${s} 켜기`, ops: [cc(17 + i, 127)] })),
    ...["A", "B", "C"].map((s, i) => ({ name: `Foot ${s} 끄기`, ops: [cc(17 + i, 0)] })),
    ...[1, 2, 3, 4, 5, 6].map(k => ({ name: `노브 ${k} 최대`, ops: [cc(19 + k, 127)] })),
  ]},
  { group: "루퍼", items: [
    { name: "루퍼 화면 열기/닫기", ops: [cc(110)] },
    { name: "재생/정지", ops: [cc(111)] },
    { name: "녹음/더빙", ops: [cc(112)] },
    { name: "슬롯 지우기", ops: [cc(113)] },
    { name: "언두", ops: [cc(114)] },
    { name: "리두", ops: [cc(115)] },
    { name: "다음 슬롯", ops: [cc(117)] },
    { name: "이전 슬롯", ops: [cc(118)] },
  ]},
];

const commonPresets = [
  { group: "컨트롤러", items: [
    { name: "다음 모드(프로필)로 전환", ops: [{ mode: "next" }] },
    { name: "이전 모드(프로필)로 전환", ops: [{ mode: "prev" }] },
  ]},
];

export const CATALOGUES = {
  qc: { title: "Quad Cortex mini", groups: qcPresets },
  anagram: { title: "Anagram", groups: anaPresets },
};

export function presetsFor(profileName, tag) {
  const key = /^(qc|quad)/i.test(profileName) || /^QC/.test(tag || "") ? "qc"
            : /^(ana)/i.test(profileName) || /^ANA/.test(tag || "") ? "anagram" : null;
  const ret = [];
  if (key) ret.push(...CATALOGUES[key].groups.map(g => ({ ...g, group: `${CATALOGUES[key].title} · ${g.group}` })));
  for (const [k, c] of Object.entries(CATALOGUES)) {
    if (k !== key) ret.push(...c.groups.map(g => ({ ...g, group: `${c.title} · ${g.group}` })));
  }
  ret.push(...commonPresets);
  return ret;
}
