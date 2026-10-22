// UI translations (English, Simplified Chinese, Japanese, Korean) and locale handling.
// t(key, vars) looks up a string for the current language, "{name}" placeholders are replaced by vars.name.
// Multilingual profile texts (descriptions) are either plain strings or { en, zh, ja, ko, "*" } objects, see pick().

export const LANGS = { en: "English", zh: "简体中文", ja: "日本語", ko: "한국어" };

const STORAGE_KEY = "multimode.lang";

// Order: ?lang= in the URL (for sharing a link in a language), saved choice, browser languages, English
function detect() {
  const param = new URLSearchParams(location.search).get("lang");
  if (param && LANGS[param]) return param;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && LANGS[saved]) return saved;
  } catch { /* storage unavailable */ }
  for (const l of navigator.languages || [navigator.language || "en"]) {
    const base = String(l).toLowerCase().split("-")[0];
    if (LANGS[base]) return base;
  }
  return "en";
}

export let lang = detect();

const HTML_LANG = { en: "en", zh: "zh-Hans", ja: "ja", ko: "ko" };

export function setLang(l) {
  if (!LANGS[l]) return;
  lang = l;
  try { localStorage.setItem(STORAGE_KEY, l); } catch { /* storage unavailable */ }
  document.documentElement.lang = HTML_LANG[l];
}

// Picks the text for the current language from a multilingual value
export function pick(v) {
  if (v == null) return "";
  if (typeof v !== "object") return String(v);
  return v[lang] ?? v["*"] ?? v.en ?? v.ko ?? Object.values(v)[0] ?? "";
}

// Sets the text of the current language in a multilingual value and returns the new value (null if empty)
export function assign(v, text) {
  const obj = v == null ? {} : typeof v === "object" ? { ...v } : { "*": String(v) };
  if (text) obj[lang] = text; else delete obj[lang];
  const keys = Object.keys(obj);
  return keys.length ? obj : null;
}

export function t(key, vars) {
  const e = D[key];
  let s = e ? (e[lang] ?? e.en) : key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return s;
}

// Translates static markup: data-i18n (text), data-i18n-ph (placeholder), data-i18n-aria (aria-label), data-i18n-title
export function applyStatic(root = document) {
  for (const el of root.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll("[data-i18n-ph]")) el.placeholder = t(el.dataset.i18nPh);
  for (const el of root.querySelectorAll("[data-i18n-aria]")) el.setAttribute("aria-label", t(el.dataset.i18nAria));
  for (const el of root.querySelectorAll("[data-i18n-title]")) el.title = t(el.dataset.i18nTitle);
  document.title = t("app.title");
}

// key: { en, zh, ja, ko }
const D = {
  "app.title": { en: "Captain Multimode", zh: "Captain Multimode", ja: "Captain Multimode", ko: "Captain Multimode" },
  "app.sub": { en: "MIDI Captain mapping editor", zh: "MIDI Captain 映射编辑器", ja: "MIDI Captain マッピングエディター", ko: "MIDI Captain 매핑 에디터" },
  "app.language": { en: "Language", zh: "语言", ja: "言語", ko: "언어" },
  "app.footer": {
    en: "Based on PySwitch (GPLv3, Thomas Weber) · multimode extension · Quad Cortex, Anagram and MIDI Captain are trademarks of their owners; this tool is not affiliated with the manufacturers.",
    zh: "基于 PySwitch（GPLv3，Thomas Weber）· multimode 扩展 · Quad Cortex、Anagram 和 MIDI Captain 是其各自所有者的商标，本工具与制造商无关。",
    ja: "PySwitch（GPLv3、Thomas Weber）ベース · multimode 拡張 · Quad Cortex、Anagram、MIDI Captain は各所有者の商標であり、本ツールはメーカーとは無関係です。",
    ko: "PySwitch (GPLv3, Thomas Weber) 기반 · multimode 확장 · Quad Cortex, Anagram, MIDI Captain은 각 소유자의 상표이며 이 도구는 제조사와 무관합니다.",
  },
  "app.source": { en: "Source on GitHub", zh: "GitHub 源代码", ja: "GitHub のソースコード", ko: "GitHub 소스 코드" },
  "app.firmware": { en: "Firmware {v}", zh: "固件 {v}", ja: "ファームウェア {v}", ko: "펌웨어 {v}" },

  // Connection
  "conn.none": { en: "No device", zh: "未连接设备", ja: "デバイス未接続", ko: "장치 미연결" },
  "conn.ok": { en: "Device connected", zh: "设备已连接", ja: "デバイス接続済み", ko: "장치 연결됨" },
  "conn.connect": { en: "Connect device drive", zh: "连接设备磁盘", ja: "デバイスのドライブを接続", ko: "장치 드라이브 연결" },
  "conn.unsupported": {
    en: "This browser cannot write to drives. Open this page in desktop Chrome or Edge.",
    zh: "此浏览器无法写入磁盘。请使用桌面版 Chrome 或 Edge 打开本页。",
    ja: "このブラウザはドライブに書き込めません。デスクトップ版の Chrome か Edge で開いてください。",
    ko: "이 브라우저는 드라이브 쓰기를 지원하지 않습니다. 데스크톱 Chrome 또는 Edge에서 열어 주십시오.",
  },
  "conn.editOnly": {
    en: "You can edit here, but saving to the device needs desktop Chrome or Edge.",
    zh: "可以在此编辑，但保存到设备需要桌面版 Chrome 或 Edge。",
    ja: "編集はできますが、デバイスへの保存にはデスクトップ版の Chrome か Edge が必要です。",
    ko: "편집은 할 수 있지만, 장치에 저장하려면 데스크톱 Chrome 또는 Edge가 필요합니다.",
  },
  "conn.noBootOut": {
    en: "This is not a MIDI Captain drive (no boot_out.txt). Select the top folder of the MIDICAPTAIN or CIRCUITPY drive. If the drive does not show up, hold switch 1 while powering on.",
    zh: "这不是 MIDI Captain 磁盘（没有 boot_out.txt）。请选择 MIDICAPTAIN 或 CIRCUITPY 磁盘的根目录。如果看不到磁盘，请按住 1 号开关再开机。",
    ja: "MIDI Captain のドライブではありません（boot_out.txt がありません）。MIDICAPTAIN または CIRCUITPY ドライブの最上位フォルダーを選んでください。ドライブが表示されない場合は、スイッチ 1 を押したまま電源を入れてください。",
    ko: "MIDI Captain 드라이브가 아닙니다 (boot_out.txt 없음). MIDICAPTAIN 또는 CIRCUITPY 드라이브의 최상위 폴더를 선택해 주십시오. 드라이브가 보이지 않으면 1번 스위치를 누른 채 부팅해 주십시오.",
  },
  "conn.loaded": { en: "Loaded the device's profiles: {list}", zh: "已读取设备上的配置：{list}", ja: "デバイスのプロファイルを読み込みました：{list}", ko: "장치 프로필을 불러왔습니다: {list}" },
  "conn.loadFailed": {
    en: "Could not read the device's profiles ({e}). Showing the default profiles.",
    zh: "无法读取设备上的配置（{e}）。显示默认配置。",
    ja: "デバイスのプロファイルを読み込めませんでした（{e}）。既定のプロファイルを表示します。",
    ko: "장치의 프로필을 읽지 못했습니다 ({e}). 기본 프로필을 표시합니다.",
  },
  "load.defaultsFailed": { en: "Could not load the default profiles: {e}", zh: "无法加载默认配置：{e}", ja: "既定のプロファイルを読み込めませんでした：{e}", ko: "기본 프로필을 불러오지 못했습니다: {e}" },

  "preview.title": { en: "Preview", zh: "预览", ja: "プレビュー", ko: "미리보기" },
  "preview.text": {
    en: "No device connected: you are looking at the bundled example profiles. Changes stay in this browser; connect the device drive to load and save its own settings.",
    zh: "未连接设备：当前显示的是内置示例配置。更改只保存在此浏览器中；连接设备磁盘后即可读取和保存设备上的设置。",
    ja: "デバイス未接続：内蔵のサンプルプロファイルを表示しています。変更はこのブラウザ内だけです。デバイスのドライブを接続すると、デバイスの設定を読み込んで保存できます。",
    ko: "장치 미연결: 내장 예시 프로필이 표시됩니다. 변경 내용은 이 브라우저에만 유지됩니다. 장치 드라이브를 연결하면 장치의 설정을 불러와 저장할 수 있습니다.",
  },
  "preview.needDevice": { en: "Connect the device to change the mode list", zh: "连接设备后才能修改模式列表", ja: "モード一覧を変えるにはデバイスを接続してください", ko: "모드 목록은 장치를 연결해야 변경할 수 있습니다" },
  "preview.discard": {
    en: "Discard the changes made in the preview and load the device's settings?",
    zh: "放弃在预览中所做的更改，并读取设备上的设置？",
    ja: "プレビューでの変更を破棄して、デバイスの設定を読み込みますか？",
    ko: "미리보기에서 변경한 내용을 버리고 장치 설정을 불러오시겠습니까?",
  },
  // Side panel
  "side.device": { en: "Device", zh: "设备", ja: "デバイス", ko: "기기" },
  "side.model": { en: "Model", zh: "型号", ja: "モデル", ko: "모델" },
  "side.modes": { en: "Modes", zh: "模式", ja: "モード", ko: "모드" },
  "side.addMode": { en: "+ Add", zh: "+ 添加", ja: "+ 追加", ko: "+ 추가" },
  "side.modesHint": {
    en: "The default mode starts at power-on. Hold a boot key while powering on to start in its mode.",
    zh: "开机时启动默认模式。开机时按住启动键可进入对应的模式。",
    ja: "電源を入れると既定のモードで起動します。起動キーを押したまま電源を入れると、そのモードで起動します。",
    ko: "기본 모드는 부팅할 때 시작되는 모드입니다. 부팅 키를 누른 채 부팅하면 해당 모드로 시작합니다.",
  },
  "side.bootKeys": { en: "Boot keys (key 1 is reserved for the USB drive)", zh: "启动键（1 号键用于 USB 磁盘）", ja: "起動キー（キー 1 は USB ドライブ用）", ko: "부팅 키 (1번은 드라이브 연결용이라 제외)" },
  "side.key": { en: "Key {k}", zh: "键 {k}", ja: "キー {k}", ko: "키 {k}" },
  "side.default": { en: "default", zh: "默认", ja: "既定", ko: "기본" },
  "side.makeDefault": { en: "Make default", zh: "设为默认", ja: "既定にする", ko: "기본 모드로 지정" },
  "side.moveUp": { en: "Move up", zh: "上移", ja: "上へ", ko: "위로" },
  "side.moveDown": { en: "Move down", zh: "下移", ja: "下へ", ko: "아래로" },
  "side.removeMode": { en: "Remove from modes", zh: "从模式中移除", ja: "モードから外す", ko: "모드에서 제외" },
  "side.deviceSection": { en: "Device", zh: "设备", ja: "デバイス", ko: "장치" },
  "side.save": { en: "Save to device", zh: "保存到设备", ja: "デバイスに保存", ko: "장치에 저장" },
  "side.firmware": { en: "Install / update firmware", zh: "安装/更新固件", ja: "ファームウェアのインストール・更新", ko: "펌웨어 설치·업데이트" },
  "side.export": { en: "Export JSON", zh: "导出 JSON", ja: "JSON を書き出す", ko: "JSON 내보내기" },
  "side.import": { en: "Import JSON", zh: "导入 JSON", ja: "JSON を読み込む", ko: "JSON 가져오기" },
  "side.os": { en: "OS", zh: "系统", ja: "OS", ko: "OS" },
  "side.installed": { en: "Installed", zh: "已安装", ja: "インストール済み", ko: "설치됨" },
  "side.latest": { en: "Latest", zh: "最新", ja: "最新", ko: "최신" },
  "side.none": { en: "none", zh: "无", ja: "なし", ko: "없음" },
  "bat.title": { en: "Battery calibration", zh: "电池校准", ja: "バッテリー校正", ko: "배터리 보정" },
  "bat.fullPin": { en: "Monitor voltage with a full battery (V)", zh: "满电时的检测电压（V）", ja: "満充電時のモニター電圧（V）", ko: "완전 충전 시 감지 전압 (V)" },
  "bat.hint": {
    en: "Charge fully, power on from the battery, and enter the value the status bar shows (e.g. BAT 0.912V). The charge is then shown in % (assumes a Li-ion cell, 4.2 V when full).",
    zh: "充满电后用电池开机，填写状态栏显示的值（例如 BAT 0.912V）。之后会以 % 显示电量（假定为锂离子电池，满电 4.2 V）。",
    ja: "満充電にしてバッテリーで起動し、ステータスバーに表示された値（例：BAT 0.912V）を入力します。以降は残量が % で表示されます（リチウムイオン電池、満充電 4.2 V を想定）。",
    ko: "완전히 충전한 뒤 배터리로 부팅하고, 상태줄에 표시된 값(예: BAT 0.912V)을 입력합니다. 이후 잔량이 %로 표시됩니다 (리튬 이온 배터리, 만충 4.2V 기준).",
  },
  "serial.title": { en: "Serial (restart, bootloader)", zh: "串口（重启、引导程序）", ja: "シリアル（再起動・ブートローダー）", ko: "시리얼 (재시작·부트로더)" },
  "serial.restart": { en: "Restart device", zh: "重启设备", ja: "デバイスを再起動", ko: "장치 재시작" },
  "serial.uf2": { en: "Restart into the bootloader", zh: "重启进入引导程序", ja: "ブートローダーで再起動", ko: "부트로더로 재시작" },
  "serial.flash": { en: "Flash another .uf2 file", zh: "写入其他 .uf2 文件", ja: "別の .uf2 ファイルを書き込む", ko: "다른 .uf2 파일 설치" },
  "serial.hint": {
    en: "Chrome and Edge only. The bootloader (RPI-RP2 drive) is built into the chip and is never overwritten: installing a .uf2 file only replaces the firmware. Reinstalling CircuitPython keeps the files on its drive.",
    zh: "仅支持 Chrome 和 Edge。引导程序（RPI-RP2 磁盘）内置在芯片中，永远不会被覆盖：安装 .uf2 文件只会替换固件。重新安装 CircuitPython 时，磁盘上的文件会保留。",
    ja: "Chrome と Edge のみ対応。ブートローダー（RPI-RP2 ドライブ）はチップに内蔵されていて書き換わりません。.uf2 ファイルをインストールしても置き換わるのはファームウェアだけです。CircuitPython を入れ直してもドライブのファイルは残ります。",
    ko: "Chrome, Edge에서만 동작합니다. 부트로더(RPI-RP2 드라이브)는 칩에 내장돼 있어 바뀌지 않습니다. .uf2 파일을 설치하면 펌웨어만 교체됩니다. CircuitPython을 다시 설치해도 드라이브의 파일은 유지됩니다.",
  },
  "serial.unsupported": { en: "This browser does not support Web Serial (Chrome or Edge needed).", zh: "此浏览器不支持 Web Serial（需要 Chrome 或 Edge）。", ja: "このブラウザは Web Serial に対応していません（Chrome か Edge が必要です）。", ko: "이 브라우저는 Web Serial을 지원하지 않습니다 (Chrome, Edge 필요)." },
  "serial.restarted": { en: "Sent the restart command.", zh: "已发送重启命令。", ja: "再起動コマンドを送りました。", ko: "재시작 명령을 보냈습니다." },
  "serial.uf2Done": {
    en: "Sent the restart signal. When the RPI-RP2 drive appears, install CircuitPython 7.3.1.",
    zh: "已发送重启信号。出现 RPI-RP2 磁盘后，请安装 CircuitPython 7.3.1。",
    ja: "再起動の信号を送りました。RPI-RP2 ドライブが現れたら CircuitPython 7.3.1 をインストールしてください。",
    ko: "재시작 신호를 보냈습니다. RPI-RP2 드라이브가 나타나면 CircuitPython 7.3.1을 설치합니다.",
  },
  "serial.notRp2": { en: "This is not the RPI-RP2 drive (no INFO_UF2.TXT).", zh: "这不是 RPI-RP2 磁盘（没有 INFO_UF2.TXT）。", ja: "RPI-RP2 ドライブではありません（INFO_UF2.TXT がありません）。", ko: "RPI-RP2 드라이브가 아닙니다 (INFO_UF2.TXT 없음)." },
  "serial.flashed": {
    en: "Wrote the .uf2 file. The device restarts by itself.",
    zh: "已写入 .uf2 文件，设备会自动重启。",
    ja: ".uf2 ファイルを書き込みました。デバイスは自動で再起動します。",
    ko: ".uf2 파일을 기록했습니다. 장치가 자동으로 재시작합니다.",
  },
  "serial.flashMaybe": {
    en: "The UF2 write finished or was interrupted ({e}). If the device restarted, everything is fine.",
    zh: "UF2 写入已完成或被中断（{e}）。如果设备已重启，则一切正常。",
    ja: "UF2 の書き込みが完了したか中断されました（{e}）。デバイスが再起動していれば問題ありません。",
    ko: "UF2 쓰기가 끝났거나 중단됐습니다 ({e}). 장치가 재시작했다면 정상입니다.",
  },

  // Tabs
  "tab.install": { en: "Install", zh: "安装", ja: "インストール", ko: "설치" },
  "tab.usage": { en: "Usage", zh: "使用说明", ja: "使い方", ko: "사용법" },
  "tab.keys": { en: "Key mapping", zh: "按键映射", ja: "キー割り当て", ko: "키 매핑" },
  "tab.settings": { en: "Profile settings", zh: "配置设置", ja: "プロファイル設定", ko: "프로필 설정" },
  "tab.json": { en: "JSON", zh: "JSON", ja: "JSON", ko: "JSON" },
  "prof.name": { en: "Profile name", zh: "配置名称", ja: "プロファイル名", ko: "프로필 이름" },

  // Triggers and operations
  "trig.short": { en: "Short press", zh: "短按", ja: "短押し", ko: "짧게 누르기" },
  "trig.long": { en: "Long press", zh: "长按", ja: "長押し", ko: "길게 누르기" },
  "trig.double": { en: "Double click", zh: "双击", ja: "ダブルクリック", ko: "더블 클릭" },
  "trig.doubleHint": {
    en: "When defined, the short press runs after the double click window",
    zh: "定义后，短按会在双击间隔结束后才执行",
    ja: "定義すると、短押しはダブルクリックの待ち時間の後に実行されます",
    ko: "정의하면 짧게 누르기가 더블 클릭 간격만큼 늦게 실행됩니다",
  },
  "op.cc": { en: "Send CC", zh: "发送 CC", ja: "CC 送信", ko: "CC 전송" },
  "op.pc": { en: "Send PC", zh: "发送 PC", ja: "PC 送信", ko: "PC 전송" },
  "op.note": { en: "Note on", zh: "音符开", ja: "ノートオン", ko: "노트 온" },
  "op.raw": { en: "Raw bytes", zh: "原始字节", ja: "生バイト", ko: "원시 바이트" },
  "op.set": { en: "Set variable", zh: "设置变量", ja: "変数を設定", ko: "변수 설정" },
  "op.toggle": { en: "Toggle variable", zh: "切换变量", ja: "変数を切り替え", ko: "변수 토글" },
  "op.inc": { en: "Step variable", zh: "增减变量", ja: "変数を増減", ko: "변수 증감" },
  "op.mode": { en: "Switch mode", zh: "切换模式", ja: "モード切り替え", ko: "모드 전환" },
  "op.if": { en: "Condition", zh: "条件", ja: "条件", ko: "조건" },
  "f.cc": { en: "CC number", zh: "CC 编号", ja: "CC 番号", ko: "CC 번호" },
  "f.val": { en: "Value", zh: "值", ja: "値", ko: "값" },
  "f.ch": { en: "Channel", zh: "通道", ja: "チャンネル", ko: "채널" },
  "f.chDefault": { en: "default", zh: "默认", ja: "既定", ko: "기본" },
  "f.pc": { en: "Program", zh: "音色", ja: "プログラム", ko: "프로그램" },
  "f.note": { en: "Note", zh: "音符", ja: "ノート", ko: "노트" },
  "f.vel": { en: "Velocity", zh: "力度", ja: "ベロシティ", ko: "벨로시티" },
  "f.raw": { en: "Bytes (comma separated)", zh: "字节（逗号分隔）", ja: "バイト（カンマ区切り）", ko: "바이트 (쉼표)" },
  "f.var": { en: "Variable", zh: "变量", ja: "変数", ko: "변수" },
  "f.to": { en: "Value / expression", zh: "值/表达式", ja: "値・式", ko: "값/식" },
  "f.by": { en: "Step", zh: "步长", ja: "増減", ko: "증감" },
  "f.mod": { en: "Wrap (mod)", zh: "循环（mod）", ja: "循環（mod）", ko: "순환(mod)" },
  "f.lo": { en: "Start", zh: "起始值", ja: "開始値", ko: "시작값" },
  "f.min": { en: "Min", zh: "最小", ja: "最小", ko: "최소" },
  "f.max": { en: "Max", zh: "最大", ja: "最大", ko: "최대" },
  "f.target": { en: "Target", zh: "目标", ja: "対象", ko: "대상" },
  "f.if": { en: "Condition", zh: "条件表达式", ja: "条件式", ko: "조건식" },
  "f.then": { en: "If true (JSON)", zh: "为真时（JSON）", ja: "真のとき（JSON）", ko: "참일 때 (JSON)" },
  "f.else": { en: "If false (JSON)", zh: "为假时（JSON）", ja: "偽のとき（JSON）", ko: "거짓일 때 (JSON)" },
  "f.notJson": { en: "Not valid JSON", zh: "不是有效的 JSON", ja: "JSON の形式ではありません", ko: "JSON 형식이 아닙니다" },
  "sum.toggle": { en: "toggle {v}", zh: "切换 {v}", ja: "{v} 切替", ko: "{v} 토글" },
  "sum.mode": { en: "mode {v}", zh: "模式 {v}", ja: "モード {v}", ko: "모드 {v}" },
  "sum.if": { en: "if ({v})", zh: "条件（{v}）", ja: "条件（{v}）", ko: "조건({v})" },

  // Usage sheet
  "usage.boot": { en: "Hold while powering on", zh: "开机时按住", ja: "電源投入時に押し続ける", ko: "부팅할 때 누르고 있기" },
  "usage.bootDrive": { en: "Connect the USB drive (settings, firmware)", zh: "连接 USB 磁盘（设置、固件）", ja: "USB ドライブを接続（設定・ファームウェア）", ko: "USB 드라이브 연결 (설정·펌웨어 변경용)" },
  "usage.bootMode": { en: "Start in {name}", zh: "以 {name} 模式启动", ja: "{name} モードで起動", ko: "{name} 모드로 시작" },
  "usage.key": { en: "Key", zh: "键", ja: "キー", ko: "키" },
  "usage.when": { en: "when: {v}", zh: "条件：{v}", ja: "条件：{v}", ko: "조건: {v}" },
  "usage.always": { en: "always", zh: "始终", ja: "常時", ko: "항상" },
  "usage.hint": {
    en: "The first layer from the top whose condition is true defines a key. Grey text has no description and shows the MIDI messages instead. Edit descriptions in the Key mapping tab.",
    zh: "从上往下第一个条件成立的层决定按键的动作。灰色文字表示没有说明，显示的是实际的 MIDI 消息。可在“按键映射”标签页中编辑说明。",
    ja: "上から順に、条件が成り立つ最初のレイヤーがキーの動作を決めます。灰色の文字は説明がないため、代わりに MIDI メッセージを表示しています。説明は「キー割り当て」タブで編集できます。",
    ko: "위쪽 레이어부터 조건이 맞는 첫 레이어가 키 동작을 정합니다. 흐린 글씨는 설명이 없어 실제 MIDI 메시지를 대신 표시한 것입니다. 설명은 '키 매핑' 탭에서 수정할 수 있습니다.",
  },

  // Layers and device face
  "layer.n": { en: "Layer {n}", zh: "层 {n}", ja: "レイヤー {n}", ko: "레이어 {n}" },
  "layer.add": { en: "+ Layer", zh: "+ 层", ja: "+ レイヤー", ko: "+ 레이어" },
  "layer.name": { en: "Layer name", zh: "层名称", ja: "レイヤー名", ko: "레이어 이름" },
  "layer.when": { en: "Active when (Python expression, empty = always)", zh: "生效条件（Python 表达式，留空表示始终）", ja: "有効条件（Python の式、空なら常時）", ko: "활성 조건 (Python 식, 비우면 항상)" },
  "layer.whenPh": { en: "e.g. gig, not lp", zh: "例如：gig, not lp", ja: "例：gig, not lp", ko: "예: gig, not lp" },
  "layer.earlier": { en: "Move earlier", zh: "前移", ja: "前へ", ko: "앞으로" },
  "layer.later": { en: "Move later", zh: "后移", ja: "後へ", ko: "뒤로" },
  "layer.delete": { en: "Delete layer", zh: "删除层", ja: "レイヤーを削除", ko: "레이어 삭제" },
  "layer.confirmDelete": { en: "Delete the layer “{name}”?", zh: "删除层“{name}”？", ja: "レイヤー「{name}」を削除しますか？", ko: "'{name}' 레이어를 삭제할까요?" },
  "layer.desc": { en: "Layer description", zh: "层说明", ja: "レイヤーの説明", ko: "레이어 설명" },
  "face.screen": { en: "Screen preview", zh: "屏幕预览", ja: "画面プレビュー", ko: "화면 미리보기" },
  "face.overflow": { en: "“{text}” is {w}px wide, the space has {max}px", zh: "“{text}”宽 {w}px，可用空间为 {max}px", ja: "「{text}」は幅 {w}px、スペースは {max}px です", ko: "'{text}'의 폭은 {w}px, 공간은 {max}px입니다" },
  "face.hint": {
    en: "Click a switch to edit it. The first layer from the top whose condition is true defines a key. Faded keys are not defined in this layer and follow another layer.",
    zh: "点击开关进行编辑。从上往下第一个条件成立的层决定按键。半透明的键在此层没有定义，沿用其他层的设置。",
    ja: "スイッチを押すと編集できます。上から順に、条件が成り立つ最初のレイヤーがキーを決めます。薄く表示されたキーはこのレイヤーに定義がなく、他のレイヤーに従います。",
    ko: "키를 선택해 편집합니다. 위쪽 레이어부터 조건이 맞는 첫 레이어가 키를 정의합니다. 흐리게 표시된 키는 이 레이어에 정의가 없어 다른 레이어 설정을 따릅니다.",
  },

  // Key editor
  "ed.title": { en: "Edit key", zh: "编辑按键", ja: "キーを編集", ko: "키 편집" },
  "ed.empty": {
    en: "Click a switch on the device in the middle to edit its label, color and actions here.",
    zh: "点击中间设备图上的开关，即可在此编辑标签、颜色和动作。",
    ja: "中央のデバイス図でスイッチを押すと、ここでラベル・色・動作を編集できます。",
    ko: "가운데 기기 그림에서 스위치를 선택하면 여기서 라벨, 색, 동작을 편집할 수 있습니다.",
  },
  "ed.head": { en: "Key {k} · {layer}", zh: "键 {k} · {layer}", ja: "キー {k} · {layer}", ko: "키 {k} · {layer}" },
  "ed.removeHere": { en: "Remove from this layer", zh: "从此层删除", ja: "このレイヤーから削除", ko: "이 레이어에서 삭제" },
  "ed.inherits": { en: "Not defined in this layer, so it follows the layer “{from}”.", zh: "此层没有定义，沿用“{from}”层的设置。", ja: "このレイヤーには定義がないため、「{from}」レイヤーの設定に従います。", ko: "이 레이어에는 정의가 없어 '{from}' 레이어 설정을 따릅니다." },
  "ed.undefined": { en: "This key is not defined in any layer.", zh: "此键在任何层中都没有定义。", ja: "このキーはどのレイヤーにも定義されていません。", ko: "어느 레이어에도 정의가 없는 키입니다." },
  "ed.addHere": { en: "Define this key in this layer", zh: "在此层定义此键", ja: "このレイヤーでキーを定義", ko: "이 레이어에 키 정의 추가" },
  "ed.label": { en: "Label template ({expr} is replaced by its value, max. 5 characters recommended)", zh: "标签模板（{expr} 处替换为值，建议不超过 5 个字符）", ja: "ラベルのテンプレート（{expr} の部分に値が入ります。5 文字以内推奨）", ko: "라벨 템플릿 ({식} 자리에 값 표시, 5자 이내 권장)" },
  "ed.color": { en: "Color (name, #rrggbb or expression)", zh: "颜色（名称、#rrggbb 或表达式）", ja: "色（名前、#rrggbb、または式）", ko: "색 (이름, #rrggbb 또는 식)" },
  "ed.palette": { en: "Color palette", zh: "调色板", ja: "カラーパレット", ko: "색 팔레트" },
  "ed.exprSwatch": { en: "Expressions are shown striped", zh: "表达式以条纹显示", ja: "式の場合は縞模様で表示されます", ko: "식이면 줄무늬로 표시됩니다" },
  "ed.led": { en: "LED (empty = same as color)", zh: "LED（留空则与颜色相同）", ja: "LED（空なら色と同じ）", ko: "LED (비우면 색과 같음)" },
  "ed.bright": { en: "Brightness (0-1)", zh: "亮度（0-1）", ja: "明るさ（0-1）", ko: "밝기 (0-1)" },
  "ed.desc": { en: "Description in {lang} (shown in Usage)", zh: "{lang}说明（显示在使用说明中）", ja: "{lang}の説明（使い方に表示）", ko: "{lang} 설명 (사용법 탭에 표시)" },
  "ed.descAria": { en: "{trigger} description", zh: "{trigger}说明", ja: "{trigger}の説明", ko: "{trigger} 설명" },
  "ed.noOps": { en: "No actions", zh: "无动作", ja: "動作なし", ko: "동작 없음" },
  "ed.addPreset": { en: "Add from presets…", zh: "从预设添加…", ja: "プリセットから追加…", ko: "프리셋에서 추가…" },
  "ed.addPresetAria": { en: "Add a preset to {trigger}", zh: "向{trigger}添加预设", ja: "{trigger}にプリセットを追加", ko: "{trigger}에 프리셋 추가" },
  "ed.addManual": { en: "+ Custom", zh: "+ 自定义", ja: "+ 手動", ko: "+ 직접 입력" },
  "ed.removeTrigger": { en: "Remove {trigger}", zh: "移除{trigger}", ja: "{trigger}を削除", ko: "{trigger} 정의 제거" },
  "ed.opType": { en: "Action type", zh: "动作类型", ja: "動作の種類", ko: "동작 종류" },
  "ed.up": { en: "Up", zh: "上移", ja: "上へ", ko: "위로" },
  "ed.down": { en: "Down", zh: "下移", ja: "下へ", ko: "아래로" },
  "ed.delete": { en: "Delete", zh: "删除", ja: "削除", ko: "삭제" },

  // Profile settings
  "set.tag": { en: "Display tag", zh: "显示标签", ja: "表示タグ", ko: "표시 태그" },
  "set.channel": { en: "MIDI channel (1-16)", zh: "MIDI 通道（1-16）", ja: "MIDI チャンネル（1-16）", ko: "MIDI 채널 (1-16)" },
  "set.hold": { en: "Long press (ms)", zh: "长按（毫秒）", ja: "長押し（ms）", ko: "길게 누르기 (ms)" },
  "set.double": { en: "Double click window (ms)", zh: "双击间隔（毫秒）", ja: "ダブルクリック間隔（ms）", ko: "더블 클릭 간격 (ms)" },
  "set.power": { en: "Show power / battery (variable pw)", zh: "显示电源/电池（变量 pw）", ja: "電源・バッテリーを表示（変数 pw）", ko: "전원/배터리 표시 (pw 변수)" },
  "set.state": { en: "State variables (JSON)", zh: "状态变量（JSON）", ja: "状態変数（JSON）", ko: "상태 변수 (JSON)" },
  "set.consts": { en: "Constants (JSON)", zh: "常量（JSON）", ja: "定数（JSON）", ko: "상수 (JSON)" },
  "set.vars": { en: "Derived variables (JSON list of [name, expression], computed in order)", zh: "派生变量（JSON，[名称, 表达式] 列表，按顺序计算）", ja: "派生変数（JSON、[名前, 式] のリスト。順に計算）", ko: "파생 변수 (JSON, [이름, 식] 목록. 순서대로 계산)" },
  "ed.hint": { en: "Hint (long press, small text)", zh: "提示（长按，小字）", ja: "ヒント（長押し・小さい文字）", ko: "힌트 (길게 누르기, 작은 글씨)" },
  "ed.hintPh": { en: "e.g. TUNER", zh: "例如 TUNER", ja: "例：TUNER", ko: "예: TUNER" },
  "layer.screen": { en: "Screen of this layer (JSON, overrides the profile's screen attribute by attribute)", zh: "此层的屏幕（JSON，逐项覆盖配置的屏幕设置）", ja: "このレイヤーの画面（JSON。プロファイルの画面設定を項目ごとに上書き）", ko: "이 레이어의 화면 (JSON, 프로필 화면 설정을 항목별로 덮어씀)" },
  "set.status": { en: "Status line", zh: "状态栏", ja: "ステータス行", ko: "상태줄" },
  "set.statusColor": { en: "Status color", zh: "状态栏颜色", ja: "ステータスの色", ko: "상태줄 색" },
  "set.powerText": { en: "Power (right of the status line)", zh: "电源（状态栏右侧）", ja: "電源（ステータス行の右）", ko: "전원 (상태줄 오른쪽)" },
  "set.message": { en: "Message line (when no action is shown)", zh: "消息行（未显示动作时）", ja: "メッセージ行（動作を表示していないとき）", ko: "메시지 줄 (동작 표시가 없을 때)" },
  "set.messageColor": { en: "Message color", zh: "消息颜色", ja: "メッセージの色", ko: "메시지 색" },
  "set.tiles": { en: "Information tiles (JSON list of { caption, value, color })", zh: "信息块（JSON，{ caption, value, color } 列表）", ja: "情報タイル（JSON。{ caption, value, color } のリスト）", ko: "정보 타일 (JSON, { caption, value, color } 목록)" },
  "op.flash": { en: "Show message", zh: "显示消息", ja: "メッセージ表示", ko: "메시지 표시" },
  "f.flash": { en: "Text", zh: "文字", ja: "テキスト", ko: "문구" },
  "f.ms": { en: "Duration (ms)", zh: "时长（毫秒）", ja: "表示時間（ms）", ko: "표시 시간 (ms)" },
  "f.color": { en: "Color", zh: "颜色", ja: "色", ko: "색" },
  "sum.flash": { en: "show “{v}”", zh: "显示“{v}”", ja: "「{v}」を表示", ko: "'{v}' 표시" },
  "set.jsonError": { en: "{attr}: invalid JSON ({e})", zh: "{attr}：JSON 格式错误（{e}）", ja: "{attr}：JSON の形式エラー（{e}）", ko: "{attr}: JSON 형식 오류 ({e})" },
  "json.apply": { en: "Apply JSON", zh: "应用 JSON", ja: "JSON を適用", ko: "JSON 적용" },
  "json.applied": { en: "Applied", zh: "已应用", ja: "適用しました", ko: "적용했습니다" },
  "json.needLayers": { en: "A “layers” list is required", zh: "需要“layers”数组", ja: "「layers」配列が必要です", ko: "layers 배열이 필요합니다" },
  "json.aria": { en: "Profile JSON", zh: "配置 JSON", ja: "プロファイル JSON", ko: "프로필 JSON" },

  // Validation and saving
  "val.missing": { en: "{n}: profile file missing", zh: "{n}：缺少配置文件", ja: "{n}：プロファイルファイルがありません", ko: "{n}: 프로필 파일이 없습니다" },
  "val.unknownOp": { en: "{where}: unknown action {op}", zh: "{where}：未知动作 {op}", ja: "{where}：不明な動作 {op}", ko: "{where}: 알 수 없는 동작 {op}" },
  "val.unknownVar": { en: "{where}: variable “{v}” is not in state", zh: "{where}：变量“{v}”不在 state 中", ja: "{where}：変数「{v}」が state にありません", ko: "{where}: 변수 '{v}'가 state에 없습니다" },
  "val.unknownMode": { en: "{where}: mode “{v}” does not exist", zh: "{where}：模式“{v}”不存在", ja: "{where}：モード「{v}」がありません", ko: "{where}: 모드 '{v}'가 없습니다" },
  "val.default": { en: "The default mode is not in the mode list", zh: "默认模式不在模式列表中", ja: "既定のモードがモード一覧にありません", ko: "기본 모드가 모드 목록에 없습니다" },
  "save.invalid": { en: "Not saved. Please fix: {list}", zh: "未保存。请修正：{list}", ja: "保存しませんでした。修正が必要です：{list}", ko: "저장하지 않았습니다. 수정할 항목: {list}" },
  "save.connectFirst": { en: "Connect the device drive first.", zh: "请先连接设备磁盘。", ja: "先にデバイスのドライブを接続してください。", ko: "먼저 장치 드라이브를 연결해 주십시오." },
  "save.done": {
    en: "Saved. Power the device off and on again without holding a switch to apply it.",
    zh: "已保存。不按任何开关重新开机即可生效。",
    ja: "保存しました。スイッチを押さずに電源を入れ直すと反映されます。",
    ko: "저장했습니다. 스위치를 누르지 않고 재부팅하면 적용됩니다.",
  },
  "save.saving": { en: "Saving…", zh: "正在保存…", ja: "保存中…", ko: "저장 중…" },
  "save.saved": { en: "Saved ✓", zh: "已保存 ✓", ja: "保存しました ✓", ko: "저장됨 ✓" },
  "save.verified": {
    en: "Saved {n} files to the device and read them back: identical. Power the device off and on without holding a switch to apply.",
    zh: "已将 {n} 个文件保存到设备并回读校验：内容一致。不按任何开关重新开机即可生效。",
    ja: "{n} 個のファイルをデバイスに保存し、読み戻して確認しました（一致）。スイッチを押さずに電源を入れ直すと反映されます。",
    ko: "장치에 파일 {n}개를 저장하고 다시 읽어 확인했습니다 (일치). 스위치를 누르지 않고 재부팅하면 적용됩니다.",
  },
  "save.mismatch": {
    en: "Saved, but {file} reads back differently. The drive may have been ejected. Reconnect and save again.",
    zh: "已保存，但回读 {file} 时内容不一致。磁盘可能已被推出，请重新连接后再保存。",
    ja: "保存しましたが、{file} を読み戻すと内容が異なります。ドライブが取り出された可能性があります。接続し直して再度保存してください。",
    ko: "저장했지만 {file}을 다시 읽은 내용이 다릅니다. 드라이브가 분리됐을 수 있습니다. 다시 연결한 뒤 저장해 주십시오.",
  },
  "save.statusDirty": { en: "Unsaved changes", zh: "有未保存的更改", ja: "未保存の変更があります", ko: "저장 안 된 변경 있음" },
  "save.statusSaved": { en: "Last saved {time} · matches the device", zh: "上次保存 {time} · 与设备一致", ja: "最終保存 {time} · デバイスと一致", ko: "마지막 저장 {time} · 장치와 일치" },
  "save.statusLoaded": { en: "Same as on the device", zh: "与设备上的内容相同", ja: "デバイスの内容と同じ", ko: "장치 내용과 같음" },
  "toast.close": { en: "Close", zh: "关闭", ja: "閉じる", ko: "닫기" },
  "save.failed": { en: "Could not save: {e}. Check that the drive is still connected.", zh: "无法保存：{e}。请确认磁盘仍处于连接状态。", ja: "保存できませんでした：{e}。ドライブが接続されているか確認してください。", ko: "저장하지 못했습니다: {e}. 드라이브가 연결돼 있는지 확인해 주십시오." },
  "fw.state": { en: "Firmware", zh: "固件", ja: "ファームウェア", ko: "펌웨어" },
  "fw.checkingShort": { en: "comparing with the latest build…", zh: "正在与最新版本比较…", ja: "最新ビルドと比較中…", ko: "최신 빌드와 비교 중…" },
  "fw.upToDate": { en: "up to date (identical to the latest build)", zh: "已是最新（与最新版本完全相同）", ja: "最新（最新ビルドと同一）", ko: "최신 (최신 빌드와 파일 동일)" },
  "fw.outdated": { en: "update available: {n} file(s) differ", zh: "有可用更新：{n} 个文件不同", ja: "更新あり：{n} 個のファイルが異なります", ko: "업데이트 있음: 파일 {n}개 다름" },
  "fw.checking": { en: "Checking firmware {i}/{n}: {path}", zh: "正在检查固件 {i}/{n}：{path}", ja: "ファームウェアを確認中 {i}/{n}：{path}", ko: "펌웨어 확인 중 {i}/{n}: {path}" },
  "fw.done": { en: "Firmware {v} installed: wrote {n} file(s), the others were up to date.", zh: "固件 {v} 已安装：写入了 {n} 个文件，其余已是最新。", ja: "ファームウェア {v} をインストールしました：{n} 個のファイルを書き込みました（残りは最新）。", ko: "펌웨어 {v}을 설치했습니다. 파일 {n}개를 새로 기록했고, 나머지는 이미 최신입니다." },
  "fw.failed": { en: "The firmware installation stopped: {e}. Run it again to write the remaining files.", zh: "固件安装中断：{e}。再次运行将只写入剩余文件。", ja: "ファームウェアのインストールが途中で止まりました：{e}。もう一度実行すると残りのファイルだけを書き込みます。", ko: "펌웨어 설치가 중간에 멈췄습니다: {e}. 다시 실행하면 남은 파일만 기록합니다." },

  // Modes
  "mode.confirmRemove": { en: "Remove “{n}” from the modes? The JSON file on the device is kept.", zh: "从模式中移除“{n}”？设备上的 JSON 文件会保留。", ja: "「{n}」をモードから外しますか？デバイス上の JSON ファイルは残ります。", ko: "'{n}' 모드를 목록에서 제외하시겠습니까? 장치의 JSON 파일은 삭제하지 않습니다." },
  "mode.prompt": { en: "File name of the new mode (lowercase letters, digits, _){hint}", zh: "新模式的文件名（小写字母、数字、_）{hint}", ja: "新しいモードのファイル名（英小文字・数字・_）{hint}", ko: "새 모드의 파일 이름 (영문 소문자, 숫자, _){hint}" },
  "mode.unused": { en: " (profiles not in the list: {list})", zh: "（未在列表中的配置：{list}）", ja: "（一覧にないプロファイル：{list}）", ko: " (목록에 없는 프로필: {list})" },
  "mode.badName": { en: "File names may only contain lowercase letters, digits and _.", zh: "文件名只能包含小写字母、数字和 _。", ja: "ファイル名には英小文字・数字・_ だけを使えます。", ko: "파일 이름에는 영문 소문자, 숫자, _만 쓸 수 있습니다." },
  "mode.exists": { en: "“{n}” is already in the mode list.", zh: "“{n}”已在模式列表中。", ja: "「{n}」はすでにモード一覧にあります。", ko: "'{n}'은 이미 모드 목록에 있습니다." },
  "mode.baseLayer": { en: "Base", zh: "基础", ja: "基本", ko: "기본" },
  "import.done": { en: "Imported the profile “{n}”.", zh: "已导入配置“{n}”。", ja: "プロファイル「{n}」を読み込みました。", ko: "'{n}' 프로필을 가져왔습니다." },
  "import.failed": { en: "Could not import: {e}", zh: "无法导入：{e}", ja: "読み込めませんでした：{e}", ko: "가져오지 못했습니다: {e}" },
  "import.noLayers": { en: "it has no “layers”", zh: "缺少“layers”", ja: "「layers」がありません", ko: "layers가 없습니다" },

  // Install wizard
  "inst.lead": {
    en: "Installs this firmware on a MIDI Captain with the stock firmware 1.x or 5.x, PySwitch or CircuitPython. The drive is checked first; if needed, CircuitPython 7.3.1 is installed, and the original files are backed up to your computer.",
    zh: "将本固件安装到运行原厂固件 1.x 或 5.x、PySwitch 或 CircuitPython 的 MIDI Captain 上。会先检查磁盘，必要时安装 CircuitPython 7.3.1，并把原有文件备份到电脑。",
    ja: "純正ファームウェア 1.x・5.x、PySwitch、CircuitPython が入った MIDI Captain に、このファームウェアをインストールします。まずドライブを確認し、必要なら CircuitPython 7.3.1 をインストールし、元のファイルを PC にバックアップします。",
    ko: "순정 펌웨어 1.x, 5.x, PySwitch, CircuitPython이 들어 있는 MIDI Captain에 이 펌웨어를 설치합니다. 먼저 드라이브를 확인하고, 필요하면 CircuitPython 7.3.1을 설치하며, 원래 파일은 PC에 백업합니다.",
  },
  "inst.s1": { en: "Open the device drive", zh: "打开设备磁盘", ja: "デバイスのドライブを開く", ko: "장치 드라이브 열기" },
  "inst.s1a": { en: "Connect the device by USB, then power it on ", zh: "用 USB 连接电脑，然后", ja: "USB で PC に接続し、", ko: "USB 케이블로 PC에 연결한 뒤, " },
  "inst.s1b": { en: "while holding switch 1 (top left)", zh: "按住 1 号开关（左上）", ja: "スイッチ 1（左上）を押したまま", ko: "1번 스위치(왼쪽 위)를 누른 채" },
  "inst.s1c": {
    en: ". The MIDICAPTAIN or CIRCUITPY drive appears (with the stock firmware 5.x, under the name chosen when it was formatted).",
    zh: "开机。会出现 MIDICAPTAIN 或 CIRCUITPY 磁盘（原厂固件 5.x 则显示为格式化时设定的名称）。",
    ja: "電源を入れてください。MIDICAPTAIN または CIRCUITPY ドライブが現れます（純正ファームウェア 5.x では、フォーマット時に付けた名前で表示されます）。",
    ko: " 부팅합니다. MIDICAPTAIN 또는 CIRCUITPY 드라이브가 나타납니다. 순정 5.x는 포맷할 때 지정한 이름으로 나타납니다.",
  },
  "inst.s1hint": {
    en: "Needs desktop Chrome or Edge. Select the top folder of the drive and allow editing files.",
    zh: "需要桌面版 Chrome 或 Edge。选择磁盘根目录并允许修改文件。",
    ja: "デスクトップ版の Chrome か Edge が必要です。ドライブの最上位フォルダーを選び、ファイルの編集を許可してください。",
    ko: "데스크톱 Chrome 또는 Edge가 필요합니다. 드라이브 최상위 폴더를 선택하고 파일 수정 권한을 허용합니다.",
  },
  "inst.check": { en: "Check the device", zh: "检查设备", ja: "デバイスの確認", ko: "장치 확인" },
  "inst.kind.multimode": { en: "multimode installed", zh: "已安装 multimode", ja: "multimode インストール済み", ko: "multimode 설치됨" },
  "inst.kind.pyswitch": { en: "PySwitch (without multimode)", zh: "PySwitch（无 multimode）", ja: "PySwitch（multimode なし）", ko: "PySwitch (multimode 없음)" },
  "inst.kind.other": { en: "stock or other firmware", zh: "原厂或其他固件", ja: "純正または他のファームウェア", ko: "순정 또는 다른 펌웨어" },
  "inst.cpBad": {
    en: "This device runs CircuitPython {v}. This firmware only runs on CircuitPython 7.x (the .mpy libraries of PySwitch are built for 7.x).",
    zh: "此设备运行的是 CircuitPython {v}。本固件只能在 CircuitPython 7.x 上运行（PySwitch 附带的 .mpy 库是为 7.x 编译的）。",
    ja: "このデバイスは CircuitPython {v} です。このファームウェアは CircuitPython 7.x でのみ動作します（PySwitch の .mpy ライブラリが 7.x 用のため）。",
    ko: "이 장치는 CircuitPython {v}입니다. 이 펌웨어는 CircuitPython 7.x에서만 동작합니다 (PySwitch의 .mpy 라이브러리가 7.x용).",
  },
  "inst.s2": { en: "Back up the original files", zh: "备份原有文件", ja: "元のファイルをバックアップ", ko: "원래 파일 백업" },
  "inst.s2text": {
    en: "Copies every file of the device to a folder on your computer. The stock firmware 1.x cannot be downloaded again, so keep it (especially the license folder).",
    zh: "将设备上的所有文件复制到电脑上的文件夹。原厂固件 1.x 无法再次下载，请务必妥善保存（尤其是 license 文件夹）。",
    ja: "デバイスのすべてのファイルを PC のフォルダーにコピーします。純正ファームウェア 1.x は再入手できないので、必ず保管してください（特に license フォルダー）。",
    ko: "장치의 모든 파일을 PC 폴더로 복사합니다. 순정 펌웨어 1.x는 다시 다운로드할 수 없으므로 반드시 보관해야 합니다 (특히 license 폴더).",
  },
  "inst.backup": { en: "Choose a backup folder", zh: "选择备份文件夹", ja: "バックアップ先を選ぶ", ko: "백업할 폴더 선택" },
  "inst.backupAgain": { en: "Back up again", zh: "重新备份", ja: "もう一度バックアップ", ko: "다시 백업" },
  "inst.backupSaved": { en: "Saved: {name} ({n} files)", zh: "已保存：{name}（{n} 个文件）", ja: "保存済み：{name}（{n} ファイル）", ko: "저장됨: {name} (파일 {n}개)" },
  "inst.skip": { en: "Continue without a backup (I already use PySwitch and have a backup)", zh: "不备份继续（我已在使用 PySwitch 并且有备份）", ja: "バックアップせずに続ける（すでに PySwitch を使っていてバックアップがある）", ko: "백업 없이 진행 (이미 PySwitch를 사용 중이고 백업이 있음)" },
  "inst.backingUp": { en: "Backing up {i}: {f}", zh: "正在备份 {i}：{f}", ja: "バックアップ中 {i}：{f}", ko: "백업 중 {i}: {f}" },
  "inst.backedUp": { en: "Backed up to “{name}” in the selected folder ({n} files).", zh: "已备份到所选文件夹中的“{name}”（{n} 个文件）。", ja: "選択したフォルダー内の「{name}」にバックアップしました（{n} ファイル）。", ko: "선택한 폴더 안의 '{name}'에 백업했습니다 (파일 {n}개)." },
  "inst.backupFailed": { en: "Could not back up: {e}. Choose another folder (e.g. Documents) and try again.", zh: "无法备份：{e}。请选择其他文件夹（例如“文稿”）后重试。", ja: "バックアップできませんでした：{e}。別のフォルダー（例：書類）を選んでもう一度試してください。", ko: "백업하지 못했습니다: {e}. 다른 폴더(예: 문서)를 선택해 다시 시도해 주십시오." },
  "inst.s3": { en: "Install", zh: "安装", ja: "インストール", ko: "설치" },
  "inst.model": { en: "Device model", zh: "设备型号", ja: "デバイスのモデル", ko: "기기 모델" },
  "inst.clean": { en: "Delete the existing files first (recommended, the license folder is kept)", zh: "先删除现有文件（推荐，保留 license 文件夹）", ja: "既存のファイルを削除してからインストール（推奨。license フォルダーは残します）", ko: "기존 파일 삭제 후 설치 (권장, license 폴더는 유지)" },
  "inst.writes": { en: "Writes firmware {v} ({n} files) and {m} mode(s): {list}.", zh: "将写入固件 {v}（{n} 个文件）和 {m} 个模式：{list}。", ja: "ファームウェア {v}（{n} ファイル）と {m} 個のモード（{list}）を書き込みます。", ko: "펌웨어 {v} 파일 {n}개와 모드 {m}개({list})를 기록합니다." },
  "inst.go": { en: "Install", zh: "开始安装", ja: "インストールする", ko: "설치하기" },
  "inst.needBackup": { en: "You can install when the backup is done.", zh: "完成备份后即可安装。", ja: "バックアップが終わるとインストールできます。", ko: "백업을 마치면 설치할 수 있습니다." },
  "inst.cleaning": { en: "Deleting the existing files…", zh: "正在删除现有文件…", ja: "既存のファイルを削除しています…", ko: "기존 파일을 삭제하는 중…" },
  "inst.done": { en: "Installed. Restart the device as described in “Finish”.", zh: "安装完成。请按“完成”中的步骤重新启动设备。", ja: "インストールしました。「仕上げ」の手順でデバイスを起動し直してください。", ko: "설치를 마쳤습니다. 아래 '마무리' 순서대로 재부팅해 주십시오." },
  "inst.failed": { en: "The installation stopped: {e}. Check the drive and run it again. Your backup is untouched.", zh: "安装中断：{e}。请检查磁盘连接后重试。备份不受影响。", ja: "インストールが途中で止まりました：{e}。ドライブの接続を確認してもう一度実行してください。バックアップはそのまま残っています。", ko: "설치가 중간에 멈췄습니다: {e}. 드라이브 연결을 확인하고 다시 실행해 주십시오. 백업은 그대로 있습니다." },
  "inst.s4": { en: "Finish", zh: "完成", ja: "仕上げ", ko: "마무리" },
  "inst.s4a": {
    en: "Eject the drive (Finder ⏏, Windows: Safely Remove Hardware) and wait until it disappears.",
    zh: "推出磁盘（访达 ⏏，Windows：安全删除硬件），等待其完全消失。",
    ja: "ドライブを取り出し（Finder ⏏、Windows：ハードウェアの安全な取り外し）、消えるまで待ちます。",
    ko: "드라이브를 꺼내고(Finder ⏏, Windows: 하드웨어 안전하게 제거) 완전히 사라질 때까지 기다립니다.",
  },
  "inst.s4b1": { en: "Power the device on ", zh: "", ja: "", ko: "" },
  "inst.s4b2": { en: "without holding a switch", zh: "不按任何开关", ja: "スイッチを押さずに", ko: "스위치를 누르지 않고" },
  "inst.s4b3": { en: ". When the mode and key labels show up, it worked.", zh: "重新开机。屏幕上出现模式和按键标签即表示成功。", ja: "電源を入れ直します。画面にモードとキーのラベルが出れば成功です。", ko: " 재부팅합니다. 화면에 모드와 키 라벨이 나오면 성공입니다." },
  "inst.s4c": { en: "To change settings later, hold switch 1 while powering on and connect on this page.", zh: "以后要修改设置时，按住 1 号开关开机，并在本页连接。", ja: "設定を変えるときは、スイッチ 1 を押したまま電源を入れて、このページで接続します。", ko: "설정을 변경할 때는 1번 스위치를 누른 채 부팅하고 이 페이지에서 연결합니다." },
  "inst.restoreTitle": { en: "Restore", zh: "恢复", ja: "元に戻す", ko: "되돌리기" },
  "inst.restoreHint": { en: "Choose a backup folder to delete the device's files and restore the backup.", zh: "选择备份文件夹后，将删除设备上的文件并恢复备份内容。", ja: "バックアップフォルダーを選ぶと、デバイスのファイルを削除してバックアップの内容に戻します。", ko: "백업 폴더를 선택하면 장치 파일을 삭제하고 백업 내용으로 되돌립니다." },
  "inst.restore": { en: "Restore from backup", zh: "从备份恢复", ja: "バックアップから復元", ko: "백업에서 복원" },
  "inst.notBackup": { en: "This is not a backup folder. Select the “midicaptain-backup-…” folder itself.", zh: "这不是备份文件夹。请直接选择“midicaptain-backup-…”文件夹。", ja: "バックアップフォルダーではありません。「midicaptain-backup-…」フォルダーそのものを選んでください。", ko: "백업 폴더가 아닙니다. 'midicaptain-backup-…' 폴더 자체를 선택해 주십시오." },
  "inst.wiping": { en: "Deleting the device's files…", zh: "正在删除设备上的文件…", ja: "デバイスのファイルを削除しています…", ko: "장치 파일을 삭제하는 중…" },
  "inst.restoring": { en: "Restoring {i}: {f}", zh: "正在恢复 {i}：{f}", ja: "復元中 {i}：{f}", ko: "복원 중 {i}: {f}" },
  "inst.restored": { en: "Restored ({n} files). Power the device on without holding a switch to run the backed up firmware.", zh: "已恢复（{n} 个文件）。不按任何开关重新开机，即可运行备份的固件。", ja: "復元しました（{n} ファイル）。スイッチを押さずに電源を入れると、バックアップしたファームウェアに戻ります。", ko: "복원했습니다 (파일 {n}개). 스위치를 누르지 않고 재부팅하면 백업한 펌웨어로 돌아갑니다." },
  "inst.restoreFailed": { en: "The restore stopped: {e}. Running it again copies everything again.", zh: "恢复中断：{e}。再次运行会重新复制全部文件。", ja: "復元が途中で止まりました：{e}。もう一度実行すると最初からコピーし直します。", ko: "복원이 중간에 멈췄습니다: {e}. 다시 실행하면 처음부터 다시 복사합니다." },

  // Bootloader, CircuitPython and manual install
  "serial.flashing": { en: "Writing the .uf2 file…", zh: "正在写入 .uf2 文件…", ja: ".uf2 ファイルを書き込み中…", ko: ".uf2 파일 기록 중…" },
  "inst.kind.empty": {
    en: "CircuitPython only (no firmware files)",
    zh: "仅 CircuitPython（无固件文件）",
    ja: "CircuitPython のみ（ファームウェアのファイルなし）",
    ko: "CircuitPython만 설치됨 (펌웨어 파일 없음)",
  },
  "inst.emptyNoBackup": {
    en: "The drive only holds the files of a fresh CircuitPython, so there is nothing to back up.",
    zh: "磁盘中只有新安装的 CircuitPython 文件，无需备份。",
    ja: "ドライブには新しくインストールした CircuitPython のファイルしかないため、バックアップは不要です。",
    ko: "드라이브에 새로 설치한 CircuitPython 파일만 있어 백업할 내용이 없습니다.",
  },
  "inst.cpBackup": {
    en: "Back up the drive first, then install CircuitPython 7.3.1. The files on the drive are kept.",
    zh: "请先备份磁盘，然后安装 CircuitPython 7.3.1。磁盘上的文件会保留。",
    ja: "まずドライブをバックアップしてから CircuitPython 7.3.1 をインストールします。ドライブのファイルは残ります。",
    ko: "먼저 드라이브를 백업한 뒤 CircuitPython 7.3.1을 설치합니다. 드라이브의 파일은 유지됩니다.",
  },
  "inst.installing": { en: "Installing…", zh: "正在安装…", ja: "インストール中…", ko: "설치 중…" },
  "inst.slow": {
    en: "Writing to the device is slow and can take several minutes. Keep this page open and the device connected until it is done.",
    zh: "写入设备较慢，可能需要几分钟。完成前请保持本页打开并保持设备连接。",
    ja: "デバイスへの書き込みは遅く、数分かかることがあります。終わるまでこのページを開いたまま、デバイスを接続しておいてください。",
    ko: "장치 쓰기가 느려 수 분 이상 걸릴 수 있습니다. 끝날 때까지 이 페이지를 닫지 말고 장치 연결을 유지해 주십시오.",
  },
  "fw.writing": { en: "Writing firmware {i}/{n}: {path}", zh: "正在写入固件 {i}/{n}：{path}", ja: "ファームウェアを書き込み中 {i}/{n}：{path}", ko: "펌웨어 기록 중 {i}/{n}: {path}" },
  "fw.badList": {
    en: "{n} file(s) differ from the latest build: {list}",
    zh: "{n} 个文件与最新版本不同：{list}",
    ja: "{n} 個のファイルが最新ビルドと異なります：{list}",
    ko: "최신 빌드와 다른 파일 {n}개: {list}",
  },
  "boot.title": { en: "Restart into the bootloader", zh: "重启进入引导程序", ja: "ブートローダーで再起動", ko: "부트로더로 재시작" },
  "boot.s1": {
    en: "Eject the drive and keep the USB cable connected.",
    zh: "推出磁盘，保持 USB 线连接。",
    ja: "ドライブを取り出し、USB ケーブルはつないだままにします。",
    ko: "드라이브를 꺼내고 USB 케이블은 연결한 상태로 둡니다.",
  },
  "boot.s2": {
    en: "Power the device off and on without holding a switch, then click the button and choose the device's serial port.",
    zh: "不按任何开关重新开机，然后点击按钮并选择设备的串口。",
    ja: "スイッチを押さずに電源を入れ直し、ボタンを押してデバイスのシリアルポートを選びます。",
    ko: "스위치를 누르지 않고 재부팅한 뒤, 버튼을 눌러 장치의 시리얼 포트를 선택합니다.",
  },
  "boot.hint": {
    en: "Only the device's port is listed (e.g. “Pico” or “Feather RP2040”). If the list is empty, check the USB cable and that the device has booted. An RPI-RP2 drive appears a few seconds later.",
    zh: "列表中只显示设备的端口（例如“Pico”或“Feather RP2040”）。如果列表为空，请检查 USB 线以及设备是否已开机。几秒后会出现 RPI-RP2 磁盘。",
    ja: "一覧にはデバイスのポート（「Pico」「Feather RP2040」など）だけが表示されます。一覧が空の場合は、USB ケーブルとデバイスが起動しているかを確認してください。数秒後に RPI-RP2 ドライブが現れます。",
    ko: "목록에는 장치의 포트(Pico, Feather RP2040 등)만 표시됩니다. 목록이 비어 있으면 USB 케이블과 장치 부팅 상태를 확인해 주십시오. 몇 초 뒤 RPI-RP2 드라이브가 나타납니다.",
  },
  "cp.title": { en: "Install CircuitPython 7.3.1", zh: "安装 CircuitPython 7.3.1", ja: "CircuitPython 7.3.1 をインストール", ko: "CircuitPython 7.3.1 설치" },
  "cp.install": { en: "Install CircuitPython 7.3.1", zh: "安装 CircuitPython 7.3.1", ja: "CircuitPython 7.3.1 をインストール", ko: "CircuitPython 7.3.1 설치" },
  "cp.text": {
    en: "PySwitch runs on CircuitPython 7.x. This writes the official CircuitPython 7.3.1 for the Raspberry Pi Pico (the version of the stock firmware 1.x) to the RPI-RP2 drive.",
    zh: "PySwitch 运行在 CircuitPython 7.x 上。此操作会把适用于 Raspberry Pi Pico 的官方 CircuitPython 7.3.1（原厂固件 1.x 所用版本）写入 RPI-RP2 磁盘。",
    ja: "PySwitch は CircuitPython 7.x で動作します。Raspberry Pi Pico 用の公式 CircuitPython 7.3.1（純正ファームウェア 1.x と同じバージョン）を RPI-RP2 ドライブに書き込みます。",
    ko: "PySwitch는 CircuitPython 7.x에서 동작합니다. Raspberry Pi Pico용 공식 CircuitPython 7.3.1(순정 펌웨어 1.x와 같은 버전)을 RPI-RP2 드라이브에 기록합니다.",
  },
  "cp.pick": {
    en: "In the folder dialog, select the RPI-RP2 drive.",
    zh: "在文件夹对话框中选择 RPI-RP2 磁盘。",
    ja: "フォルダーの選択画面で RPI-RP2 ドライブを選びます。",
    ko: "폴더 선택 창에서 RPI-RP2 드라이브를 선택합니다.",
  },
  "cp.afterTitle": { en: "Connect the CIRCUITPY drive", zh: "连接 CIRCUITPY 磁盘", ja: "CIRCUITPY ドライブを接続", ko: "CIRCUITPY 드라이브 연결" },
  "cp.next": {
    en: "After a few seconds the device restarts and a drive named CIRCUITPY appears (no switch needed). Connect it to continue the installation.",
    zh: "几秒后设备会重启，并出现名为 CIRCUITPY 的磁盘（无需按开关）。连接该磁盘以继续安装。",
    ja: "数秒後にデバイスが再起動し、CIRCUITPY というドライブが現れます（スイッチ操作は不要）。接続するとインストールを続けられます。",
    ko: "몇 초 뒤 장치가 재시작하고 CIRCUITPY 드라이브가 나타납니다 (스위치 조작 불필요). 이 드라이브를 연결하면 설치를 이어서 진행할 수 있습니다.",
  },
  "rp2.found": {
    en: "This is the bootloader drive (RPI-RP2). It only processes .uf2 firmware files; other files are not stored.",
    zh: "这是引导程序磁盘（RPI-RP2），只处理 .uf2 固件文件，其他文件不会被保存。",
    ja: "これはブートローダーのドライブ（RPI-RP2）です。.uf2 ファームウェアファイルだけを処理し、それ以外のファイルは保存されません。",
    ko: "부트로더 드라이브(RPI-RP2)입니다. .uf2 펌웨어 파일만 처리하며, 다른 파일은 저장되지 않습니다.",
  },
  "fw5.found": {
    en: "This device runs the stock firmware 5.x. It is a compiled program, not CircuitPython, so PySwitch files on its drive are never run. Install CircuitPython 7.3.1 first: a new, empty CIRCUITPY drive then takes the place of the stock firmware's settings drive.",
    zh: "此设备运行的是原厂固件 5.x。它是编译好的程序而不是 CircuitPython，因此磁盘上的 PySwitch 文件不会被执行。请先安装 CircuitPython 7.3.1，之后会出现一个新的空 CIRCUITPY 磁盘，取代原厂固件的设置磁盘。",
    ja: "このデバイスには純正ファームウェア 5.x が入っています。5.x は CircuitPython ではなくコンパイル済みのプログラムなので、ドライブに PySwitch のファイルを置いても実行されません。先に CircuitPython 7.3.1 をインストールしてください。純正ファームウェアの設定ドライブの代わりに、空の CIRCUITPY ドライブが作られます。",
    ko: "순정 펌웨어 5.x가 설치된 기기입니다. 5.x는 CircuitPython이 아니라 컴파일된 프로그램이라, 드라이브에 PySwitch 파일을 복사해도 실행되지 않습니다. 먼저 CircuitPython 7.3.1을 설치해야 하며, 설치하면 순정 펌웨어의 설정 드라이브 대신 비어 있는 CIRCUITPY 드라이브가 생성됩니다.",
  },
  "fw5.revert": {
    en: "To return to the stock firmware later, download the 5.x package from Paint Audio and follow its update guide (no license file is needed):",
    zh: "以后若要恢复原厂固件，请从 Paint Audio 下载 5.x 包并按其更新说明安装（不需要 license 文件）：",
    ja: "後で純正ファームウェアに戻すには、Paint Audio から 5.x のパッケージをダウンロードし、更新手順に従ってインストールします（license ファイルは不要）：",
    ko: "나중에 순정 펌웨어로 되돌리려면 Paint Audio에서 5.x 패키지를 다운로드해 업데이트 안내대로 설치합니다 (license 파일 불필요):",
  },
  "fw5.backup": { en: "Back up the settings (optional)", zh: "备份设置（可选）", ja: "設定をバックアップ（任意）", ko: "설정 백업 (선택)" },
  "man.title": { en: "Manual install (other browsers)", zh: "手动安装（其他浏览器）", ja: "手動インストール（他のブラウザー）", ko: "수동 설치 (다른 브라우저)" },
  "man.text": {
    en: "Without Chrome or Edge, copy the files yourself. Afterwards, connect the drive on this page in Chrome or Edge to check every file.",
    zh: "没有 Chrome 或 Edge 时，可手动复制文件。之后在 Chrome 或 Edge 中于本页连接磁盘，即可检查所有文件。",
    ja: "Chrome や Edge がない場合は、ファイルを手動でコピーします。その後 Chrome か Edge でこのページにドライブを接続すると、すべてのファイルを確認できます。",
    ko: "Chrome이나 Edge가 없으면 파일을 직접 복사합니다. 복사한 뒤 Chrome 또는 Edge에서 이 페이지에 드라이브를 연결하면 모든 파일을 확인할 수 있습니다.",
  },
  "man.zip": { en: "Download the firmware for {model} (ZIP)", zh: "下载 {model} 固件（ZIP）", ja: "{model} 用ファームウェアをダウンロード（ZIP）", ko: "{model} 펌웨어 다운로드 (ZIP)" },
  "man.zipNote": { en: " (model selected on the left)", zh: "（左侧所选型号）", ja: "（左側で選んだモデル）", ko: " (왼쪽에서 선택한 모델 기준)" },
  "man.s2": {
    en: "Hold switch 1 while powering on: the MIDICAPTAIN or CIRCUITPY drive appears. It must contain boot_out.txt (an RPI-RP2 drive is the wrong one).",
    zh: "按住 1 号开关开机，会出现 MIDICAPTAIN 或 CIRCUITPY 磁盘。磁盘中必须有 boot_out.txt（RPI-RP2 不是正确的磁盘）。",
    ja: "スイッチ 1 を押したまま電源を入れると、MIDICAPTAIN または CIRCUITPY ドライブが現れます。boot_out.txt があることを確認してください（RPI-RP2 は別のドライブです）。",
    ko: "1번 스위치를 누른 채 부팅하면 MIDICAPTAIN 또는 CIRCUITPY 드라이브가 나타납니다. 드라이브에 boot_out.txt가 있어야 합니다 (RPI-RP2는 다른 드라이브입니다).",
  },
  "man.s3": {
    en: "Copy everything on the drive to your computer (especially the license folder), then delete everything on the drive except the license folder.",
    zh: "先把磁盘上的所有内容复制到电脑（尤其是 license 文件夹），然后删除磁盘上除 license 文件夹以外的所有内容。",
    ja: "ドライブの中身をすべて PC にコピーし（特に license フォルダー）、license フォルダー以外をドライブから削除します。",
    ko: "드라이브의 모든 파일을 PC에 복사(특히 license 폴더)한 뒤, license 폴더를 제외한 드라이브의 모든 파일을 삭제합니다.",
  },
  "man.s4": {
    en: "Unzip the ZIP and copy its contents (code.py, lib, fonts, profiles, …) to the top level of the drive, not the unzipped folder itself.",
    zh: "解压 ZIP，把其中的内容（code.py、lib、fonts、profiles 等）复制到磁盘根目录，不要复制解压出的整个文件夹。",
    ja: "ZIP を展開し、中身（code.py、lib、fonts、profiles など）をドライブの最上位にコピーします。展開したフォルダーごとコピーしないでください。",
    ko: "ZIP의 압축을 풀고, 그 안의 내용(code.py, lib, fonts, profiles 등)을 드라이브 최상위에 복사합니다. 압축을 푼 폴더째 복사하지 않습니다.",
  },
  "man.s5": {
    en: "Eject the drive, wait until it disappears, then power on without holding a switch.",
    zh: "推出磁盘，等待其消失后，不按任何开关重新开机。",
    ja: "ドライブを取り出して消えるまで待ち、スイッチを押さずに電源を入れ直します。",
    ko: "드라이브를 꺼내고 사라질 때까지 기다린 뒤, 스위치를 누르지 않고 재부팅합니다.",
  },
  "man.s6": {
    en: "To check: hold switch 1 while powering on and connect the drive on this page. Files which differ from the build are listed under “Check the device”.",
    zh: "检查：按住 1 号开关开机并在本页连接磁盘。与版本不同的文件会列在“检查设备”中。",
    ja: "確認：スイッチ 1 を押したまま電源を入れ、このページでドライブを接続します。ビルドと異なるファイルが「デバイスの確認」に表示されます。",
    ko: "확인: 1번 스위치를 누른 채 부팅하고 이 페이지에서 드라이브를 연결합니다. 빌드와 다른 파일이 '장치 확인' 항목에 표시됩니다.",
  },
  "man.cp": {
    en: "Devices with the stock firmware 5.x or CircuitPython 8 or 9 need CircuitPython 7.3.1 first. Restart into the bootloader and copy this file to the RPI-RP2 drive:",
    zh: "运行原厂固件 5.x 或 CircuitPython 8、9 的设备需要先安装 CircuitPython 7.3.1。重启进入引导程序后，将此文件复制到 RPI-RP2 磁盘：",
    ja: "純正ファームウェア 5.x や CircuitPython 8・9 のデバイスは、先に CircuitPython 7.3.1 が必要です。ブートローダーで再起動し、このファイルを RPI-RP2 ドライブにコピーします：",
    ko: "순정 펌웨어 5.x나 CircuitPython 8, 9 기기는 먼저 CircuitPython 7.3.1이 필요합니다. 부트로더로 재시작한 뒤 이 파일을 RPI-RP2 드라이브에 복사합니다:",
  },
  "man.cpLink": { en: "CircuitPython 7.3.1 (.uf2)", zh: "CircuitPython 7.3.1（.uf2）", ja: "CircuitPython 7.3.1（.uf2）", ko: "CircuitPython 7.3.1 (.uf2)" },
};
