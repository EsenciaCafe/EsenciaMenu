async(page)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4173/');
 await page.evaluate(()=>localStorage.removeItem('esencia-order-notes-v1'));
 await page.reload();
 await page.getByRole('button',{name:'Ver carta',exact:true}).click();
 await page.locator('.category[data-group="pancakes"]').click();
 await page.getByRole('button',{name:'Añadir a mi pedido',exact:true}).click();
 await page.getByRole('button',{name:'Ver mi pedido',exact:true}).click();
 await page.getByRole('button',{name:'Aumentar cantidad',exact:true}).click();
 await page.locator('[data-note]').fill('Nutella y plátano · para Ana');
 if(await page.locator('.order-quantity output').innerText()!=='2')throw Error('Quantity failed');
 if(!(await page.locator('.order-purpose').innerText()).includes('no se envía'))throw Error('Purpose missing');
 await page.keyboard.press('Escape');
 await page.reload();
 await page.getByRole('button',{name:'Ver carta',exact:true}).click();
 await page.locator('#order-open').click();
 if(await page.locator('[data-note]').inputValue()!=='Nutella y plátano · para Ana')throw Error('Persistence failed');
 await page.setViewportSize({width:390,height:844});
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Overflow');
 await page.screenshot({path:'output/playwright/mi-pedido-mobile.png'});
 await page.getByRole('button',{name:'Quitar',exact:true}).click();
 if(await page.locator('.order-line').count())throw Error('Remove failed');
 if(errors.length)throw Error(errors.join(';'));
 return {passed:true,persistence:true,quantity:true,notes:true,remove:true,mobile:true};
}
