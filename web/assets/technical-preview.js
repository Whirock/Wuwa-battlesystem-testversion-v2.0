/* Isolated animation preview. Never reads/writes a battle or sends action requests. */
const TechnicalPreview = (() => {
  let replaySerial=0;
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function html(){return `<details class="technical-animation"><summary>B/D三动作技术预览 · 非战斗操作</summary><p class="warning">D v2仅通过阶段预览；B旧技术样片比例仍待修。按钮仅播放样片，不换玩家、不结算伤害、不改变牌组或资源。真实浏览器时序仍待验。</p><label>独立样片画风 <select data-tech-style><option value="D">D v2 · 阶段候选</option><option value="B">B · 旧技术候选</option></select></label><div class="technical-buttons"><button type="button" data-tech-action="idle">待机 / 重播</button><button type="button" data-tech-action="hit">预览受击</button><button type="button" data-tech-action="cast">预览统一施放</button></div><div class="technical-frame" aria-live="off"></div><p class="technical-status" role="status">样片尚未读取</p><p class="hint">动作结束回待机；重复点击从首帧重新请求，后点击覆盖前动作，切换画风取消旧动作。正式角色GIF注册表保持空白。</p></details>`;}
  function replayURL(src){const serial=++replaySerial;if(src.startsWith('data:image/gif;base64,')){
      const raw=atob(src.slice(src.indexOf(',')+1));if(raw.charCodeAt(raw.length-1)!==59)throw Error('Invalid GIF trailer');
      // A unique GIF comment changes only metadata, preserving frame bytes/timings.
      // Unlike a URI fragment, the resulting data payload really is different.
      const comment='technical-replay-'+serial;
      return 'data:image/gif;base64,'+btoa(raw.slice(0,-1)+'\x21\xfe'+String.fromCharCode(comment.length)+comment+'\x00\x3b');
    }
    return src+(src.includes('?')?'&':'?')+'technicalReplay='+serial;
  }
  function mount(container,options={}){
    const assets=options.assets||(typeof TechnicalGIFAssets==='undefined'?{}:TechnicalGIFAssets);
    const schedule=options.setTimeout||setTimeout,cancel=options.clearTimeout||clearTimeout;
    let currentStyle='D',state='idle',generation=0,timer=null,alive=true;
    const frame=container.querySelector('.technical-frame'),status=container.querySelector('.technical-status'),select=container.querySelector('[data-tech-style]');
    function stop(){cancel(timer);timer=null;generation++;}
    function fallback(text){frame.innerHTML='<div class="technical-placeholder" aria-label="动画不可用">静态占位 · 无可播放样片</div>';status.textContent=text;state='unavailable';frame.dataset.state='unavailable';}
    function play(next){if(!alive)return;stop();state=next;const expected=generation,asset=assets[currentStyle]?.[next];let loaded=false;
      if(!asset||!Number.isFinite(asset.durationMs)||asset.durationMs<=0){fallback('此画风/动作文件未安装；没有播放动画');return;}
      const image=document.createElement('img');image.className='technical-gif';image.alt=currentStyle+' '+({idle:'待机',hit:'受击',cast:'统一施放'})[next]+'技术候选';image.dataset.replayToken=String(replaySerial+1);
      status.textContent='正在读取 '+currentStyle+' · '+({idle:'待机',hit:'受击',cast:'统一施放'})[next];
      image.onload=()=>{if(!alive||expected!==generation||loaded)return;loaded=true;status.textContent=currentStyle+' · '+({idle:'待机循环',hit:'受击预览',cast:'统一施放预览'})[next]+' · '+asset.durationMs+' ms（技术候选）';if(next!=='idle')timer=schedule(()=>{if(alive&&expected===generation)play('idle');},asset.durationMs);};
      image.onerror=()=>{if(!alive||expected!==generation)return;stop();fallback('GIF读取失败，已回静态占位；可切换画风或重试');};
      frame.replaceChildren(image);
      frame.dataset.state=next;frame.dataset.style=currentStyle;
      try{image.src=replayURL(asset.src);}catch(error){image.onerror();}
    }
    const buttons=container.querySelectorAll('[data-tech-action]');buttons.forEach(button=>button.onclick=()=>play(button.dataset.techAction));
    select.onchange=()=>{currentStyle=select.value;play('idle');};
    play('idle');
    return {play,getState:()=>({style:currentStyle,state,generation}),dispose:()=>{alive=false;stop();buttons.forEach(b=>b.onclick=null);select.onchange=null;}};
  }
  return {html,mount,replayURL};
})();
