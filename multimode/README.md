# Multimode

PySwitch 위에서 도는 **데이터 기반 멀티 모드 매핑** 확장입니다. 스위치 동작을 파이썬 코드 대신 JSON 프로필로 정의하고, 웹 에디터에서 편집해서 MIDI Captain에 바로 저장합니다.

- 지원 기기: MIDI Captain Nano 4, Mini 6, 10 (PySwitch가 지원하는 기기 전부)
- 기본 프로필: Quad Cortex mini (`qc`), Anagram (`anagram`)
- 에디터: `multimode/web` (GitHub Pages로 배포)

## 구조

```
content/                 업스트림 PySwitch (boot.py, config.py, communication.py, fonts, lib/pyswitch)
multimode/overlay/       장치 루트에 덮어쓰는 파일
  code.py, display.py, inputs.py, communication.py
  lib/multimode/         엔진 (engine.py, devices.py, setup.py, store.py, power.py, bootselect.py)
  profiles/              modes.json + 프로필 JSON
multimode/web/           웹 에디터 (정적 사이트)
multimode/tools/         mmtool.py (빌드·검증·배포), sim.py (PC 시뮬레이터)
multimode/tests/         프로필 동작 테스트
```

장치 이미지 = `content/`의 업스트림 파일 + `multimode/overlay`. 업스트림 파일은 건드리지 않으므로 업스트림 머지가 쉽습니다.

## 장치에서 쓰기

| 전원 켤 때 누르고 있는 키 | 결과 |
|---|---|
| 1 | USB 드라이브 연결 (설정·펌웨어 변경) |
| `bootSelect`에 지정한 키 (기본: 2 = QC, A = Anagram) | 해당 모드로 시작하고 기억 |
| 없음 | 마지막 모드로 시작 |

프로필 안에서 `{"mode": "next"}` 동작으로도 모드를 바꿀 수 있습니다 (기본 Anagram 프로필: C 더블클릭).

## 순정 MIDI Captain에 설치

에디터의 **설치** 탭이 순서대로 안내합니다.

1. 1번 스위치를 누른 채 전원을 켜서 MIDICAPTAIN 드라이브를 열고, **장치 드라이브 연결**.
2. CircuitPython 버전 확인: PySwitch의 `.mpy` 라이브러리는 바이트코드 v5(**CircuitPython 7.x**)라서 7.x만 지원합니다. 8.x 이상이면 7.3.x `.uf2`로 먼저 바꿉니다 (에디터의 시리얼 메뉴로 부트로더 진입·굽기 가능).
3. **백업**: 장치 전체를 PC 폴더(`midicaptain-backup-…`)로 복사합니다. 순정 펌웨어는 재배포할 수 없으므로 각자 보관해야 하며, 특히 `license` 폴더가 중요합니다.
4. **설치**: 기존 파일을 지우고(`license` 폴더는 남김) 펌웨어와 프로필을 씁니다.
5. 드라이브를 꺼내고 스위치를 누르지 않고 다시 켭니다.

되돌리기: 설치 탭의 **백업에서 복원**.

## 웹 에디터

1. 1번 스위치를 누른 채 장치를 켜서 드라이브(MIDICAPTAIN 또는 CIRCUITPY)를 연결합니다.
2. 에디터에서 **장치 드라이브 연결** → 드라이브 최상위 폴더를 선택합니다. (데스크톱 Chrome·Edge)
3. 처음이면 **펌웨어 설치·업데이트**, 그다음 매핑을 편집하고 **장치에 저장**.
4. 스위치를 누르지 않고 장치를 다시 켭니다.

로컬에서 띄우기: `python3 multimode/tools/mmtool.py serve` → http://localhost:8765

언어: English, 简体中文, 日本語, 한국어. 브라우저 언어를 따르고, 상단에서 바꾸거나 `?lang=ja`처럼 링크로 지정할 수 있습니다 (문구는 `web/i18n.js`, 프리셋 이름은 `web/presets.js`).

## 명령줄 도구

```
python3 multimode/tools/mmtool.py validate     # 모든 기기 × 모든 프로필 검증 (실제 엔진으로 모든 동작 실행)
python3 multimode/tools/mmtool.py deploy       # 검증 → 장치 백업 → 바뀐 파일만 복사 (--dry-run 가능, 장치의 프로필은 --profiles 없이는 유지)
python3 multimode/tools/mmtool.py backup | restore DIR
python3 -m unittest discover -s multimode/tests
```

## 화면

```
┌──────┬──────┬──────┐  힌트 (길게 누르기, 작은 글씨)
│  A2  │  B2  │ PRE  │  라벨 (짧게 누르기)
├──────┴──────┼──────┤  상태줄 (status)          │ 전원 (power)
├──────┬──────┬──────┤  타일 캡션 (tiles[].caption)
│ PRE  │  II  │  A   │  타일 값 (tiles[].value, 40pt)
├──────┴──────┴──────┤
│      SCENE B       │  메시지 (방금 실행한 동작 = flash, 없으면 message)
├──────┬──────┬──────┤
│  C2  │  D2  │ TAP  │  라벨
│SCN - │SCN + │ GIG  │  힌트
└──────┴──────┴──────┘
```

배치는 `overlay/lib/multimode/devices.py`의 `screen_layout()` 한 곳에서 정의되고, 장치·PC 렌더러·웹 미리보기가 같이 씁니다.
화면 그림: `python3 multimode/tools/render.py` (Pillow 필요, 장치 폰트로 그림) → `multimode/screens/sheet.png`.
글자 폭 표 `tools/font_metrics.json`(`render.py --metrics`)으로 `validate`와 웹 미리보기가 칸을 넘는 문구를 알려줍니다.

메모리 (Mini 6, CircuitPython 7.3.1, 실행 중 여유 RAM): 이전 화면 50KB, 새 화면 18.5KB (라벨 21개). 표현식은 부팅 때 함수로 컴파일되고 프로필 안의 문자열을 대체해서 메모리를 아낍니다.

## 프로필 형식

```jsonc
{
  "name": "Quad Cortex mini", "tag": "QC",
  "channel": 1, "holdMs": 600, "doubleMs": 700, "power": true,
  "state":  { "gig": 0, "qp": 2 },                 // 상태 변수 (초깃값)
  "consts": { "FS": [[35,36,37,38],[39,40,41,42]] },
  "vars":   [["opp", "3 - qp"]],                   // 파생 변수, 순서대로 계산
  "screen": {
    "status": "QC  {'GIG VIEW' if gig else 'CHAIN'}", "statusColor": "DARK_YELLOW",
    "power": "{('%d%%' % pwp) if pwp >= 0 else 'USB'}",
    "tiles": [{ "caption": "MODE", "value": "{MODES[ms]}", "color": "ORANGE" }, …],
    "message": "", "messageColor": "BLACK"
  },
  "layers": [                                      // 위에서부터 조건(when)이 맞는 첫 레이어가 키를 정의
    { "name": "Gig View", "when": "gig", "screen": { "main": "GV QP{qp}" },
      "keys": {
        "1": { "label": "A{qp}", "hint": { "*": "PAGE SWAP", "mc10": "PAGE" },
               "color": "BLUE", "led": ["BLUE", "BLUE", "GRAY"],
               "short":  [{ "cc": "FS[qp - 1][0]" }],
               "long":   [{ "cc": "FS[opp - 1][0]" }],
               "double": [{ "toggle": "gig" }, { "cc": 46, "val": "127 if gig else 0" }],
               "desc":   { "short": "풋스위치 A (현재 페이지)" } } } }
  ]
}
```

- 값은 숫자 그대로이거나 **파이썬 식** 문자열입니다. 라벨은 `{식}` 템플릿입니다.
- 동작: `cc`/`val`, `pc`, `note`/`vel`, `raw`, `set`/`to`, `toggle`, `inc`/`by`/`mod`/`lo`/`min`/`max`, `if`/`then`/`else`, `mode` (`next`, `prev`, 이름), `flash`/`ms`/`color` (메시지 줄에 잠깐 표시, 기본 1500ms). 모든 MIDI 동작에 `ch`(1-16)로 채널 지정 가능.
- 레이어의 `screen`은 프로필 `screen`을 항목별로 덮어씁니다 (`tiles`는 칸별). 예: 튜너 레이어 `{"statusColor": "RED", "tiles": [{"color": "RED"}, …]}`.
- `label`, `hint`는 기기별 문구 `{ "*": 기본, "mc10": … }`도 됩니다.
- 이전 형식의 `bar`/`barColor`/`main`은 `status`/`statusColor`/`message`로 읽힙니다.
- 색: 이름(`BLUE` 등 PySwitch 색), `#rrggbb`, `[r,g,b]`, 또는 그런 값을 내는 식. `led`에 3개 목록을 주면 LED 3칸을 각각 칠합니다.
- `desc`(설명)는 문자열 또는 `{ "en": …, "zh": …, "ja": …, "ko": … }`. 에디터 전용이라 장치에는 `profiles/<이름>.desc.json`으로 따로 저장되고, 펌웨어는 읽지 않습니다.
- `double`을 정의한 키는 짧게 누르기가 `doubleMs`만큼 늦게 실행됩니다. 대기 중에는 `_pend`가 그 키 이름입니다.
- 식은 부팅할 때 한꺼번에 함수로 컴파일됩니다 (CircuitPython 7에는 `compile()`이 없고, `eval()`은 매번 ~15ms 걸림). 실측: 프로필 로드 185ms, 전체 화면 갱신 24ms, RAM 15KB.

## 라이선스

PySwitch(© Thomas Weber)의 GPLv3를 따릅니다. 이 폴더의 파일은 qc-local-mods 포크에서 추가했습니다 (2026, basster6). Adafruit 라이브러리와 폰트는 각자의 라이선스(`content/` 참고)를 따릅니다. Quad Cortex(Neural DSP), Anagram, MIDI Captain(Paint Audio)은 각 소유자의 상표이며, 이 프로젝트는 제조사와 관계가 없습니다.
