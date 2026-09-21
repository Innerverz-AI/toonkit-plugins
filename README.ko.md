# Toonkit Plugins

[English](README.md) | **한국어**

Toonkit의 이미지·영상 생성과 Canvas 작업을 위한 **Skill + MCP 연결 설정** 패키지입니다.
하나의 `plugins/toonkit`을 Codex와 Claude Code가 공유합니다. MCP 서버는 Toonkit에서
운영하므로 사용자가 별도 서버를 실행할 필요는 없습니다.

현재는 초기 플러그인 패키지입니다. 매니페스트와 Skill의 정적 검증을 완료했습니다.
설치 후 OAuth와 실제 도구 호출은 아직 검증하지 않았으며 공식 디렉터리에는 등록되지 않았습니다.

## 준비

- 플러그인 기능을 지원하는 Codex 또는 Claude Code
- Toonkit 계정과 [연결 설정](https://toonkit.io/en/settings/connections)의
  **Allow connected apps** 활성화
- 유료 생성에 사용할 크레딧. 필요하면 연결 설정에서 사용 한도를 지정합니다.

플러그인 설치와 Toonkit 계정 인증은 별도 단계입니다. 비밀번호나 토큰을 이 저장소의
설정 파일에 적지 않습니다.

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

Claude Code 안에서 실행합니다.

```text
/plugin marketplace add Innerverz-AI/toonkit-plugins
/plugin install toonkit@toonkit
```

여러 프로젝트에서 사용하려면 User 범위를 선택합니다. 설치 안내에 따라 다시 로드하거나
새 세션을 시작한 뒤 `/mcp`에서 Toonkit 연결을 선택해 인증합니다.

## 사용 예

- “Toonkit으로 비 오는 도쿄 골목 이미지를 만들어줘.”
- “이 Toonkit Canvas에서 사용할 이미지 모델과 옵션을 확인해줘.”
- “이 이미지로 영상을 만들 때 필요한 크레딧을 먼저 알려줘.”

Skill은 먼저 서버의 `toonkit_get_generation_guide`를 읽도록 안내합니다.
모델 목록, 가격, 상세 생성 규칙은 서버가 관리합니다.

## 구성

```text
.agents/plugins/marketplace.json       Codex marketplace
.claude-plugin/marketplace.json        Claude Code marketplace
plugins/toonkit/
  .codex-plugin/plugin.json            Codex manifest + MCP configuration
  .claude-plugin/plugin.json           Claude Code manifest + MCP configuration
  skills/toonkit-generation/SKILL.md    Shared skill
```

두 매니페스트는 각자의 `mcpServers`에 MCP 설정을 직접 담습니다. Codex는
`toonkit-codex`, Claude Code는 `toonkit-claude-code` OAuth 클라이언트 ID를 사용합니다.
공통 `.mcp.json`은 두지 않습니다. 기본 자동 탐색과 명시적 설정이 합쳐져 다른 클라이언트 ID의 서버가
등록되는 것을 피하기 위해서입니다. 두 매니페스트 모두 운영 `https://toonkit.io/mcp`에 연결합니다.
OAuth 클라이언트 ID는 공개 식별자이며 비밀 키가 아닙니다.

## 남은 검증

- 두 클라이언트에서 새 설치 → OAuth 로그인·동의 → 읽기 도구 호출 확인
- 공통 Skill 로딩 및 생성 가이드 호출 확인
- 기존 수동 MCP 연결과 중복 설치되는 경우의 이전 절차 확인
- 명시적으로 허용된 계정·예산으로 유료 생성과 결과 조회 확인

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
