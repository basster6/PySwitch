// MIDI action catalogue for the key editor. Each preset inserts a list of operations.
// Sources: Neural DSP Quad Cortex mini manual (CorOS 4.1.1, "Incoming MIDI Messages"),
//          Anagram manual (KosmOS 1.17, "MIDI Support", p. 87-94).
// Names are multilingual: L(en, zh, ja, ko).
import { pick } from "./i18n.js";

const L = (en, zh, ja, ko) => ({ en, zh, ja, ko });
const cc = (n, v = 127) => ({ cc: n, val: v });
const SLOTS = ["A", "B", "C", "D"];

const qcPresets = [
  { group: L("Footswitches", "脚踏开关", "フットスイッチ", "풋스위치"), items: [
    ...SLOTS.map((s, i) => ({ name: L(`Footswitch ${s} (Page I)`, `脚踏开关 ${s}（第 I 页）`, `フットスイッチ ${s}（ページ I）`, `풋스위치 ${s} (페이지 I)`), ops: [cc(35 + i)] })),
    ...SLOTS.map((s, i) => ({ name: L(`Footswitch ${s} (Page II)`, `脚踏开关 ${s}（第 II 页）`, `フットスイッチ ${s}（ページ II）`, `풋스위치 ${s} (페이지 II)`), ops: [cc(39 + i)] })),
    { name: L("Footswitch page I", "脚踏开关第 I 页", "フットスイッチ ページ I", "풋스위치 페이지 I"), ops: [cc(64, 0)] },
    { name: L("Footswitch page II", "脚踏开关第 II 页", "フットスイッチ ページ II", "풋스위치 페이지 II"), ops: [cc(64, 127)] },
  ]},
  { group: L("Scenes", "场景", "シーン", "씬"), items: [
    ...SLOTS.map((s, i) => ({ name: L(`Scene ${s} (Page I)`, `场景 ${s}（第 I 页）`, `シーン ${s}（ページ I）`, `씬 ${s} (페이지 I)`), ops: [cc(43, i)] })),
    ...SLOTS.map((s, i) => ({ name: L(`Scene ${s} (Page II)`, `场景 ${s}（第 II 页）`, `シーン ${s}（ページ II）`, `씬 ${s} (페이지 II)`), ops: [cc(43, 4 + i)] })),
  ]},
  { group: L("System", "系统", "システム", "시스템"), items: [
    { name: L("Tap tempo", "Tap 速度（踩拍）", "タップテンポ", "탭 템포"), ops: [cc(44)] },
    { name: L("Open tuner", "打开调音器", "チューナーを開く", "튜너 열기"), ops: [cc(45, 127)] },
    { name: L("Close tuner", "关闭调音器", "チューナーを閉じる", "튜너 닫기"), ops: [cc(45, 0)] },
    { name: L("Toggle tuner (state tun)", "切换调音器（状态 tun）", "チューナー切替（状態 tun）", "튜너 켜기/끄기 (상태 tun)"), ops: [{ toggle: "tun" }, { cc: 45, val: "127 if tun else 0" }], needs: { tun: 0 } },
    { name: L("Open Gig View", "打开 Gig View", "Gig View を開く", "Gig View 열기"), ops: [cc(46, 127)] },
    { name: L("Close Gig View", "关闭 Gig View", "Gig View を閉じる", "Gig View 닫기"), ops: [cc(46, 0)] },
    { name: L("Toggle Gig View (state gig)", "切换 Gig View（状态 gig）", "Gig View 切替（状態 gig）", "Gig View 켜기/끄기 (상태 gig)"), ops: [{ toggle: "gig" }, { cc: 46, val: "127 if gig else 0" }], needs: { gig: 0 } },
    { name: L("Mode slot 1 (PRESET)", "模式槽 1（PRESET）", "モードスロット 1（PRESET）", "모드 슬롯 1 (PRESET)"), ops: [cc(47, 0)] },
    { name: L("Mode slot 2 (SCENE)", "模式槽 2（SCENE）", "モードスロット 2（SCENE）", "모드 슬롯 2 (SCENE)"), ops: [cc(47, 1)] },
    { name: L("Mode slot 3 (STOMP)", "模式槽 3（STOMP）", "モードスロット 3（STOMP）", "모드 슬롯 3 (STOMP)"), ops: [cc(47, 2)] },
    { name: L("Recall preset (My Presets, #0)", "调用预设（My Presets，0 号）", "プリセット呼び出し（My Presets、0 番）", "프리셋 불러오기 (My Presets, 0번)"), ops: [cc(0, 0), cc(32, 1), { pc: 0 }] },
  ]},
  { group: L("Looper X", "Looper X", "Looper X", "Looper X"), items: [
    { name: L("Open looper", "打开 Looper", "ルーパーを開く", "루퍼 열기"), ops: [cc(48, 0)] },
    { name: L("Close looper", "关闭 Looper", "ルーパーを閉じる", "루퍼 닫기"), ops: [cc(48, 127)] },
    { name: L("Record / overdub", "录音/叠录", "録音/オーバーダブ", "녹음/오버더빙"), ops: [cc(53)] },
    { name: L("Play / stop", "播放/停止", "再生/停止", "재생/정지"), ops: [cc(54)] },
    { name: L("Undo / redo", "撤销/重做", "元に戻す/やり直し", "실행 취소/다시 실행 (Undo/Redo)"), ops: [cc(56)] },
    { name: L("Reverse", "反向播放", "リバース再生", "역재생 (Reverse)"), ops: [cc(55)] },
    { name: L("Half speed", "半速播放", "ハーフスピード", "절반 속도 (Half Speed)"), ops: [cc(51)] },
    { name: L("One shot", "单次播放", "ワンショット", "한 번만 재생 (One Shot)"), ops: [cc(50)] },
    { name: L("Duplicate", "复制循环", "ループを複製", "루프 복제 (Duplicate)"), ops: [cc(49)] },
    { name: L("Punch in / out", "插入录音（Punch In/Out）", "パンチイン/アウト", "펀치 인/아웃 (Punch In/Out)"), ops: [cc(52)] },
  ]},
];

const anaPresets = [
  { group: L("Presets and banks", "预设与库", "プリセットとバンク", "프리셋·뱅크"), items: [
    { name: L("Next preset", "下一个预设", "次のプリセット", "다음 프리셋"), ops: [cc(105)] },
    { name: L("Previous preset", "上一个预设", "前のプリセット", "이전 프리셋"), ops: [cc(106)] },
    { name: L("Select preset 1 (PC 1-126)", "选择预设 1（PC 1-126）", "プリセット 1 を選択（PC 1-126）", "프리셋 1 선택 (PC 1-126)"), ops: [{ pc: 1 }] },
    { name: L("Next bank", "下一个库", "次のバンク", "다음 뱅크"), ops: [cc(103)] },
    { name: L("Previous bank", "上一个库", "前のバンク", "이전 뱅크"), ops: [cc(104)] },
    { name: L("Preview bank 1 (1-42)", "预览库 1（1-42）", "バンク 1 をプレビュー（1-42）", "뱅크 1 미리보기 (1-42)"), ops: [cc(102, 1)] },
  ]},
  { group: L("Scenes", "场景", "シーン", "씬"), items: [
    { name: L("Next scene", "下一个场景", "次のシーン", "다음 씬"), ops: [cc(108)] },
    { name: L("Previous scene", "上一个场景", "前のシーン", "이전 씬"), ops: [cc(109)] },
    { name: L("Select scene 1 (1-126)", "选择场景 1（1-126）", "シーン 1 を選択（1-126）", "씬 1 선택 (1-126)"), ops: [cc(107, 1)] },
    { name: L("Default scene", "默认场景", "デフォルトシーン", "기본 씬"), ops: [cc(107, 127)] },
  ]},
  { group: L("Modes and system", "模式与系统", "モードとシステム", "모드·시스템"), items: [
    { name: L("Preset mode", "Preset 模式", "Preset モード", "Preset 모드"), ops: [cc(85, 1)] },
    { name: L("Stomp mode", "Stomp 模式", "Stomp モード", "Stomp 모드"), ops: [cc(85, 2)] },
    { name: L("Scene mode", "Scene 模式", "Scene モード", "Scene 모드"), ops: [cc(85, 3)] },
    { name: L("Tuner on / off", "打开/关闭调音器", "チューナーの表示/非表示", "튜너 열기/닫기"), ops: [cc(86)] },
  ]},
  { group: L("Foot bindings (Stomp)", "脚踏绑定（Stomp）", "フットバインディング（Stomp）", "풋 바인딩 (Stomp)"), items: [
    ...["A", "B", "C"].map((s, i) => {
      const v = "f" + s.toLowerCase();
      return { name: L(`Toggle foot ${s} (state ${v})`, `切换脚踏 ${s}（状态 ${v}）`, `フット ${s} 切替（状態 ${v}）`, `Foot ${s} 켜기/끄기 (상태 ${v})`), ops: [{ toggle: v }, { cc: 17 + i, val: `127 if ${v} else 0` }], needs: { [v]: 0 } };
    }),
    ...["A", "B", "C"].map((s, i) => ({ name: L(`Foot ${s} on`, `脚踏 ${s} 开`, `フット ${s} オン`, `Foot ${s} 켜기`), ops: [cc(17 + i, 127)] })),
    ...["A", "B", "C"].map((s, i) => ({ name: L(`Foot ${s} off`, `脚踏 ${s} 关`, `フット ${s} オフ`, `Foot ${s} 끄기`), ops: [cc(17 + i, 0)] })),
    ...[1, 2, 3, 4, 5, 6].map(k => ({ name: L(`Knob ${k} to maximum`, `旋钮 ${k} 调至最大`, `ノブ ${k} を最大に`, `노브 ${k} 최대`), ops: [cc(19 + k, 127)] })),
  ]},
  { group: L("Looper", "Looper", "ルーパー", "루퍼"), items: [
    { name: L("Looper screen on / off", "打开/关闭 Looper 画面", "ルーパー画面の表示/非表示", "루퍼 화면 열기/닫기"), ops: [cc(110)] },
    { name: L("Play / stop", "播放/停止", "再生/停止", "재생/정지"), ops: [cc(111)] },
    { name: L("Record / overdub", "录音/叠录", "録音/オーバーダブ", "녹음/오버더빙"), ops: [cc(112)] },
    { name: L("Clear slot", "清除槽位", "スロットを消去", "슬롯 지우기"), ops: [cc(113)] },
    { name: L("Undo", "撤销", "元に戻す", "실행 취소 (Undo)"), ops: [cc(114)] },
    { name: L("Redo", "重做", "やり直し", "다시 실행 (Redo)"), ops: [cc(115)] },
    { name: L("Next slot", "下一个槽位", "次のスロット", "다음 슬롯"), ops: [cc(117)] },
    { name: L("Previous slot", "上一个槽位", "前のスロット", "이전 슬롯"), ops: [cc(118)] },
  ]},
];

const commonPresets = [
  { group: L("Controller", "控制器", "コントローラー", "컨트롤러"), items: [
    { name: L("Switch to the next mode (profile)", "切换到下一个模式（配置）", "次のモード（プロファイル）に切り替え", "다음 모드(프로필)로 전환"), ops: [{ mode: "next" }] },
    { name: L("Switch to the previous mode (profile)", "切换到上一个模式（配置）", "前のモード（プロファイル）に切り替え", "이전 모드(프로필)로 전환"), ops: [{ mode: "prev" }] },
  ]},
];

export const CATALOGUES = {
  qc: { title: "Quad Cortex mini", groups: qcPresets },
  anagram: { title: "Anagram", groups: anaPresets },
};

// Returns the catalogue in the current language, with the catalogue matching the profile first
export function presetsFor(profileName, tag) {
  const key = /^(qc|quad)/i.test(profileName) || /^QC/.test(tag || "") ? "qc"
            : /^(ana)/i.test(profileName) || /^ANA/.test(tag || "") ? "anagram" : null;
  const order = [key, ...Object.keys(CATALOGUES).filter(k => k !== key)].filter(Boolean);
  const localize = (title, g) => ({ group: title ? `${title} · ${pick(g.group)}` : pick(g.group), items: g.items.map(it => ({ ...it, name: pick(it.name) })) });
  return [
    ...order.flatMap(k => CATALOGUES[k].groups.map(g => localize(CATALOGUES[k].title, g))),
    ...commonPresets.map(g => localize(null, g)),
  ];
}
