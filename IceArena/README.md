# ICE ARENA

Python Flask + HTML + CSS + JavaScript로 만든 로컬 2인 실시간 아케이드 게임입니다.

## 실행 방법

1. Python 3.10 이상을 설치합니다.
2. 프로젝트 폴더에서 가상환경을 만듭니다.

   ```bash
   python -m venv .venv
   ```

3. 가상환경을 활성화합니다.

   Windows PowerShell:
   ```powershell
   .\.venv\Scripts\Activate.ps1
   ```

   Windows CMD:
   ```cmd
   .venv\Scripts\activate.bat
   ```

4. Flask를 설치합니다.

   ```bash
   python -m pip install Flask
   ```

5. 서버를 실행합니다.

   ```bash
   python main.py
   ```

6. 브라우저에서 `http://127.0.0.1:5000` 을 엽니다.

## 조작 방법

- 플레이어 1: `W A S D` 이동, `F` 얼음 함정 설치
- 플레이어 2: `방향키` 이동, `Enter` 얼음 함정 설치
- `새 경기 / 재시작`: 진행 중이거나 끝난 판의 상태를 초기화합니다.

## 프로젝트 구성

- `main.py`: Flask 실행 진입점
- `app/__init__.py`: Flask 앱 생성
- `app/app.py`: 메인 페이지 라우트
- `app/templates/index.html`: 규칙, 조작법, 상태판, 게임 화면
- `app/static/style.css`: 디자인과 반응형 레이아웃
- `app/static/game.js`: 게임 진행, 입력, 충돌, 함정, 승패, 초기화

## 과제 규칙 점검

1. 게임 규칙을 화면에 표시
2. 핵심 조작을 화면에 표시
3. 생명, 상태, 경과 시간, 함정 수를 표시
4. 이동 입력은 한 칸 이동으로 처리하고 함정 설치 입력은 함정 하나를 설치
5. 생명이 0이 되면 승패/무승부 상태에 도달
6. 승리 후 다시 플레이하면 새 판으로 초기화
7. 새 경기 / 재시작 버튼은 실패 후에도 모든 판 상태를 초기화

## 참고

이 프로젝트는 교육용 원형입니다. 온라인 멀티플레이어, 서버 저장, 사운드, 모바일 터치 조작은 포함하지 않습니다.


## 그래픽 개선 버전

- `app/static/ice_arena_bg.png`: 사용자가 제공한 얼음 경기장 이미지를 배경으로 사용합니다.
- `app/static/game.js`: 16:9 배경과 아이소메트릭 다이아몬드형 격자, 플레이어 마커, 함정 효과를 그립니다.
- `app/static/style.css`: 게임 캔버스 비율을 16:9로 맞춥니다.

이미 실행 중이라면 브라우저에서 `Ctrl + F5`로 강력 새로고침하세요.
