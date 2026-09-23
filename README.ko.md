# Toonkit Plugins

[English](README.md) | **한국어**

Toonkit의 이미지·영상 생성과 Canvas 작업을 위한 **Skill 2종 + MCP 연결 설정** 패키지입니다.
하나의 `plugins/toonkit`을 Codex와 Claude Code가 공유합니다. MCP 서버는 Toonkit에서
운영하므로 사용자가 별도 서버를 실행할 필요는 없습니다.

공용 프리비즈 컴파일러가 씬 작성 전에 공간·인물 동작·카메라 연출을 검산합니다.
현재 패키지 버전은 [CHANGELOG](CHANGELOG.md), 검증 범위는 [validation](validation/README.md)을
참고하세요. 두 클라이언트의 새 설치·OAuth, Claude 브라우저 Export는 라이브 검증이 남아 있습니다.
이 저장소는 호스트가 운영하는 공식 플러그인 디렉터리에 등록되어 있지 않습니다.

## 준비

- 플러그인 기능을 지원하는 Codex 또는 Claude Code
- Toonkit 계정과 [연결 설정](https://toonkit.io/en/settings/connections)의
  **Allow connected apps** 활성화
- 유료 생성에 사용할 크레딧. 필요하면 연결 설정에서 사용 한도를 지정합니다.

`3dref` 프리비즈에는 다음이 추가로 필요합니다.

- Python 3.9 이상, 그리고 클라이언트가 조작할 수 있는 로그인된 브라우저
  (Codex는 브라우저 도구, Claude Code는 [Claude in Chrome](https://code.claude.com/docs/en/chrome))
- 공용 컴파일러·릴레이에 Node 20 이상과 npm이 필요합니다. 처음 사용할 때 고정 버전
  `three@0.184.0`과 필요한 공개 모션 파일을 쓰기 가능한 캐시에 받고 체크섬을 검증합니다.
  이후 캐시가 있으면 씬 작성 전 계산은 오프라인으로 실행할 수 있습니다.
  실제 씬 작성·전달에는 브라우저와 MCP 연결이 필요합니다.
- Codex의 메모리 유지 런처는 POSIX 셸을 사용합니다. 다른 호스트는 Python/Node 릴레이를
  사용하며, 다른 운영체제는 별도 실행 검증이 필요합니다.

플러그인 설치와 Toonkit 계정 인증은 별도 단계입니다. 비밀번호나 토큰을 이 저장소의
설정 파일에 적지 않습니다.

## Skill

| Skill | 용도 |
|---|---|
| `toonkit-project-manager` | Toonkit 이미지·영상·음성 작업에서 켜집니다. 제작을 계획하고, 유료 작업 전에 크레딧을 견적하고, 생성을 실행해 Canvas로 전달합니다. |
| `3dref` | 3D 프리비즈. MCP로 Toonkit 3D Reference 씬(배치·모션·카메라)을 만들고, 화면에 띄운 에디터에서 레퍼런스 영상을 내보냅니다. 명시적으로 요청할 때만 씁니다(Codex `$3dref`, Claude Code `/toonkit:3dref`). |

## 설치

### Codex

터미널에서 실행합니다.

```sh
codex plugin marketplace add Innerverz-AI/toonkit-plugins
codex plugin add toonkit@toonkit
```

새 대화를 열고 Toonkit MCP 연결의 인증 안내에 따라 브라우저에서 로그인하고
권한에 동의합니다. 연결 이름은 클라이언트에서 플러그인 이름으로 구분될 수 있으므로
표시된 Toonkit 연결을 사용합니다. 플러그인이 연결을 등록하므로 별도로
`codex mcp add`를 실행할 필요는 없습니다.

### Claude Code

터미널에서 실행합니다.

```sh
claude plugin marketplace add Innerverz-AI/toonkit-plugins
claude plugin install toonkit@toonkit --scope user
```

새 Claude Code 세션을 시작한 뒤 `/mcp`에서 Toonkit 연결을 선택해 브라우저에서
인증합니다. Toonkit 로그인이 필요하면 로그인하고 요청된 권한을 승인합니다.

## 사용 예

- “Toonkit으로 비 오는 도쿄 골목 이미지를 만들어줘.”
- “이 Toonkit Canvas에서 사용할 이미지 모델과 옵션을 확인해줘.”
- “이 이미지로 영상을 만들 때 필요한 크레딧을 먼저 알려줘.”
- “3dref로 캐릭터가 천천히 물러나는 카메라를 향해 걸어오는 6초 16:9 프리비즈를 만들어줘.”

project-manager Skill은 생성 전에 서버의 `toonkit_get_generation_guide`를 읽습니다.
모델 목록, 가격, 상세 생성 규칙은 서버가 관리하고, 번들된 문서에는 판단 규칙만 담습니다.

## 구성

```text
.agents/plugins/marketplace.json       Codex marketplace
.claude-plugin/marketplace.json        Claude Code marketplace
plugins/toonkit/
  .codex-plugin/plugin.json            Codex manifest + MCP configuration
  .claude-plugin/plugin.json           Claude Code manifest + MCP configuration
  skills/toonkit-project-manager/      Production planning, cost gates, AI generation
  skills/3dref/                        Shared compiler, runtime/relay, references
validation/                           Development tests; not skill runtime inputs
scripts/release.py                     Version/path checks and reproducible archive
.github/workflows/validate.yml         CI checks and tag-matched artifacts
```

두 클라이언트는 같은 플러그인 디렉터리를 설치하고 같은 Skill을 공유합니다.

두 매니페스트는 각자의 `mcpServers`에 운영 `https://toonkit.io/mcp` 연결 설정을 담습니다.
OAuth 클라이언트 ID는 지정하지 않습니다. Toonkit이
[Client ID Metadata Document](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization#client-id-metadata-documents)(CIMD)를
지원하므로 Codex와 Claude Code가 각자 공개한 메타데이터 문서로 스스로 식별하며, 별도 등록 절차가 없습니다.

`3dref`는 `3dref-production-v2` 입력, 컴파일러, 브리지를 인원수와 관계없이 공유합니다.
Codex는 페이로드를 도구 메모리에 유지하고, Claude Code는 `scripts/direct.py`로 같은 브리지의
요청을 전달합니다. 릴레이는 페이로드가 모델 컨텍스트를 지나가므로 토큰을 더 씁니다.
Claude의 Export는 자체 브라우저 도구로 수행하며 Codex 전용 브라우저 도우미를 실행하지 않습니다.
Codex의 `agents/openai.yaml`은 명시적 호출 정책을 유지하고, Claude Code는 공용 Skill 설명으로
같은 호출 범위를 안내합니다.

프리비즈는 화면에 필요한 단순 박스·스톡 휴먼·카메라 하나를 사용합니다. 로케이션 시트는
공간 관계를 전달하며 상세 도시 모델링을 요구하지 않습니다. 컴파일러가 유한 지지면, 벽을
바닥으로 보이게 하는 롤 방향, 몸·이동의 공통 슬로모, 프레이밍, 정지 구간, 충돌 및 최종
희소 키프레임을 검산합니다. 보폭과 이동 속도의 불일치는 기본적으로 차단하며 의도된 과장은
이유와 함께 선언합니다. 발 접지 IK나 예술적 품질을 보증하는 검사는 아닙니다.

렌더러 프로필은 검증된 공개 에디터 자산에 고정됩니다. 변경 시 관리자가 재검증할 때까지
씬 수정을 중단하며 매 사용자 작업에서 렌더러를 역분석하지 않습니다. 외부 리그·임의 도형·
기존 씬 부분 수정은 이번 버전 범위 밖이며 용량 한도는 라이브 MCP와 대조합니다.
일반 실행은 개발 테스트·로컬 테스트 기록·프레임 배열을 모델 컨텍스트에 읽지 않으며,
AI 생성 크레딧을 사용하지 않습니다.

이전에 고정 클라이언트 ID(`toonkit-codex`, `toonkit-claude-code`)로 연결했다면 그 연결은 계속 동작합니다.
플러그인으로 인증하면 별도 연결이 하나 더 생기므로, 필요 없으면
[연결 설정](https://toonkit.io/en/settings/connections)에서 이전 연결을 해제합니다.

## 검증 범위

- 오프라인 테스트 40개: 공간·모션·시간·저장 일치·복구·Export 조건, 매 단계 새 프로세스로
  실행하는 릴레이 전체 전달 과정 포함
- 개정 후보의 Codex 라이브 확인: 3인, 벽 롤, 슬로모, 저장 씬 대조, 1회 Export와 연결된
  출력의 디코딩 정보 확인. 모든 샷·렌더러 변경·클라이언트를 보증하는 검증은 아닙니다.
- 라이브 검증이 남은 항목: 두 클라이언트 새 설치·OAuth, Claude 브라우저 Export,
  다른 운영체제, 유료 생성. 기존 유료 생성 가이드와 인증 설정은 유지합니다.

개발·배포 명령은 [CONTRIBUTING](CONTRIBUTING.md)에 있습니다.
테스트는 개발·배포 시 실행하며 사용자 프리비즈 작업마다 실행하지 않습니다.

## 로컬 개발

```sh
git clone https://github.com/Innerverz-AI/toonkit-plugins.git "$HOME/toonkit-plugins"
```

처음 로컬 marketplace를 등록할 때 위 설치 명령의 `Innerverz-AI/toonkit-plugins`를
실제 로컬 경로로 바꿉니다. 공개 버전과 로컬 버전의 marketplace 이름이 같으므로
전환할 때는 기존 marketplace 등록을 먼저 제거합니다.

## 라이선스

이 저장소의 플러그인 파일은 [MIT 라이선스](LICENSE)로 배포됩니다.
Toonkit 호스팅 서비스의 이용 조건과 크레딧 요금은 별도입니다.

## 참고

- [Codex 플러그인](https://developers.openai.com/plugins/build/plugins)
- [Claude Code 설치](https://code.claude.com/docs/en/discover-plugins)
- [Claude Code 플러그인 명세](https://code.claude.com/docs/en/plugins-reference)
