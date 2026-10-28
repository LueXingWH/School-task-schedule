import React from 'react';

export function WelcomePanel(){
  return <>
    <section className="panel">
      <span className="status status-active">默认配置已就绪</span>
      <h2 style={{marginTop:14,fontSize:20}}>安装完成，可以开始收录了</h2>
      <p>直接粘贴文字、截图或导入 PDF / DOCX。图片识别和附件读取都在本机完成。</p>
      <div className="hint">已启用截止日排序、未来 7 天截止视图和本地保存，无需填写账号、API 密钥或服务器地址。</div>
      <div className="row">
        <a className="primary" href="#import">收录第一份通知 →</a>
        <a href="#settings">从其他浏览器恢复备份</a>
      </div>
    </section>

    <section className="panel">
      <div className="section-heading"><h2>三步用起来</h2><span>每条通知的固定动作</span></div>
      <ul className="today-list">
        <li style={{display:'flex',gap:10,alignItems:'baseline'}}>
          <span className="status status-active">1</span>
          <span><b>先收录</b>：粘贴群消息，或导入截图、PDF、DOCX。原文会先保存，识别失败也不丢。</span>
        </li>
        <li style={{display:'flex',gap:10,alignItems:'baseline'}}>
          <span className="status status-review">2</span>
          <span><b>再核对</b>：确认主截止日和材料清单；标着“待核对”的只是机器候选。</span>
        </li>
        <li style={{display:'flex',gap:10,alignItems:'baseline'}}>
          <span className="status status-done">3</span>
          <span><b>后准备</b>：逐项勾选材料、安排个人任务，当天清单会自动提醒。</span>
        </li>
      </ul>
    </section>

    <section className="panel quiet">
      <h3>收录当前网页</h3>
      <p>从浏览器工具栏的扩展菜单打开“校事笺”，点击“整理当前网页”。你也可以先在页面上选中文字再点击。</p>
      <p className="muted">把校事笺固定到工具栏，之后一键打开。安装助手创建的桌面入口也能直接打开工作台。</p>
    </section>
  </>;
}
