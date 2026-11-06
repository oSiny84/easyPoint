// 화면을 그리다 예상하지 못한 오류가 나도 빈 화면을 남기지 않는다. 자동 저장된 작품은 브라우저에 그대로 있다.
import { Component, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { if (import.meta.env.DEV) console.error(error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="crash" role="alert">
      <h1>문제가 생겼어요</h1>
      <p>마지막으로 저장된 작품은 그대로 있어요. 새로고침하면 다시 이어서 할 수 있어요.</p>
      <button className="primary" onClick={() => location.reload()}>새로고침</button>
    </div>;
  }
}
