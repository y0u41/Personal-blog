// 是否「大概率存在会话」的本地提示。
//
// 背景：access token 只存内存，页面刷新后靠 refresh Cookie（HttpOnly，JS 读不到）
// 重新换取。若首个业务请求在换取完成前发出，就会以匿名身份拿到 `liked` / `favorited`
// 这类与登录态相关的字段，表现为「刷新后我点的赞看起来消失了」（数据其实还在）。
//
// 取值约定：
//   '1' → 确认有会话（登录/注册/刷新成功时写入）
//   '0' → 确认无会话（主动登出时写入）
//   缺失或异常 → 未知，**保守地按「可能有」处理**，仍走一次会话恢复
//
// 之所以「缺失时按有会话处理」：localStorage 可能被用户清理或在不同浏览器配置间
// 不共享，而 HttpOnly 的 refresh Cookie 仍然有效。此时若直接跳过恢复，用户就会
// 看到「明明已登录却显示未登录」——这正是本次要修的类似问题。
// 提示本身不含任何凭据，被篡改的最坏后果只是一次无用的 refresh 请求。

const SESSION_HINT_KEY = 'blog.session';

export function markSessionHint(present: boolean): void {
  try {
    localStorage.setItem(SESSION_HINT_KEY, present ? '1' : '0');
  } catch {
    // 隐私模式 / 禁用 localStorage：忽略，回退到「总是尝试恢复会话」
  }
}

export function hasSessionHint(): boolean {
  try {
    return localStorage.getItem(SESSION_HINT_KEY) !== '0';
  } catch {
    return true;
  }
}
