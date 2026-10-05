"""Run only in an authorized environment with working Chromium. Not yet passed here."""
import argparse
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:8774');p.add_argument('--output',default='qa_ui');p.add_argument('--chromium',default='/usr/bin/chromium');args=p.parse_args();out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=args.chromium,headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1600,'height':1100});errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
 page.goto(args.url);page.wait_for_selector('#team input');page.screenshot(path=str(out/'preparation.png'),full_page=True)
 page.select_option('#battle-mode','live');page.select_option('#scenario',index=1)
 for route in page.locator('[data-route]').all():route.select_option(index=1)
 page.click('#start');page.wait_for_selector('.battle-unit');page.screenshot(path=str(out/'battle_B.png'),full_page=True)
 page.select_option('#visual-style','D');page.screenshot(path=str(out/'battle_D.png'),full_page=True)
 page.click('#end-turn');page.wait_for_timeout(300);page.screenshot(path=str(out/'feedback.png'),full_page=True)
 for width in [1200,900,750,390]:
  page.set_viewport_size({'width':width,'height':1000});page.screenshot(path=str(out/f'battle_{width}.png'),full_page=True)
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'overflow at {width}'
 assert not errors,errors
 browser.close()
