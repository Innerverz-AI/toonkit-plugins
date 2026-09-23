# Toonkit Plugins

[English](README.md) | **한국어**

Toonkit의 이미지·영상 생성과 Canvas 작업을 위한 **Skill 2종 + MCP 연결 설정** 패키지입니다.
하나의 `plugins/toonkit`을 Codex와 Claude Code가 공유합니다. MCP 서버는 Toonkit에서
운영하므로 사용자가 별도 서버를 실행할 필요는 없습니다.

현재는 초기 플러그인 패키지입니다. 매니페스트와 Skill의 정적 검증을 완료했습니다.
설치 후 OAuth와 실제 도구 호출은 아직 검증하지 않았으며 공식 디렉터리에는 등록되지 않았습니다.

## 준비

- 플러그인 기능을 지원하는 Codex 또는 Claude Code
- Toonkit 계정과 [연결 설정](https://toonkit.io/en/settings/connections)의
  **Allow connected apps** 활성화
- 유료 생성에 사용할 크레딧. 필요하면 연결 설정에서 사용 한도를 지정합니다.

`3dref` 프리비즈에는 다음이 추가로 필요합니다.

- Python 3.9 이상, 그리고 클라이언트가 조작할 수 있는 로그인된 브라우저
  (Codex는 브라우저 도구, Claude Code는 [Claude in Chrome](https://code.claude.com/docs/en/chrome))
- 스톡 휴먼 복합 모션에는 Node 20 이상. 처음 사용할 때 고정 버전 `three@0.184.0`을
  쓰기 가능한 캐시에 설치합니다.

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
  skills/3dref/                        3D previz authoring and export
```

두 클라이언트는 같은 플러그인 디렉터리를 설치하고 같은 Skill을 공유합니다.

두 매니페스트는 각자의 `mcpServers`에 운영 `https://toonkit.io/mcp` 연결 설정을 담습니다.
OAuth 클라이언트 ID는 지정하지 않습니다. Toonkit이
[Client ID Metadata Document](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization#client-id-metadata-documents)(CIMD)를
지원하므로 Codex와 Claude Code가 각자 공개한 메타데이터 문서로 스스로 식별하며, 별도 등록 절차가 없습니다.

`3dref`는 같은 컴파일러와 실행 저널 위에 실행 경로가 두 가지입니다. Codex는 페이로드를
도구 메모리에 두는 번들 런타임을 씁니다. Claude Code처럼 모델이 MCP 도구를 하나씩 호출하는
호스트는 `scripts/direct.py`로 요청을 하나씩 전달합니다. 이 경로에서는 모든 batch가 모델
컨텍스트를 지나가므로, 길거나 몸 동작을 굽는 샷은 토큰을 눈에 띄게 더 씁니다. Codex에서는
`agents/openai.yaml`이 `3dref`의 암묵적 호출을 막습니다. Claude Code에는 Codex 플러그인
검증기를 통과하는 같은 설정이 없어서, Skill 설명만으로 명시적 요청에 한정합니다.

이전에 고정 클라이언트 ID(`toonkit-codex`, `toonkit-claude-code`)로 연결했다면 그 연결은 계속 동작합니다.
플러그인으로 인증하면 별도 연결이 하나 더 생기므로, 필요 없으면
[연결 설정](https://toonkit.io/en/settings/connections)에서 이전 연결을 해제합니다.

## 남은 검증

- 두 클라이언트에서 새 설치 → OAuth 로그인·동의 → 읽기 도구 호출 확인
- 공통 Skill 로딩 및 생성 가이드 호출 확인
- 기존 수동 MCP 연결과 중복 설치되는 경우의 이전 절차 확인
- 명시적으로 허용된 계정·예산으로 유료 생성과 결과 조회 확인
- 두 경로에서 `3dref` 전 과정 확인: 라이브 카탈로그 확인, 씬 작성, 에디터 Export와 결과 노드 대조.
  Claude Code 경로는 아직 가짜 응답을 쓴 오프라인 테스트만 거쳤습니다.

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
