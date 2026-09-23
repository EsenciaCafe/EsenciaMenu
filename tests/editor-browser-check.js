// Run from the repository with playwright-cli run-code --filename=tests/editor-browser-check.js
// Requires the local server on port 4173. All Firebase modules are replaced and
// all Google API requests are blocked. Writes affect this in-memory fixture only.
async (page) => {
  const origin='http://127.0.0.1:4173';
  const fixture=new Map(Object.entries({
    'settings/menu':{promo_enabled:true,promo_image_url:'assets/popup/436caf36-2fad-4212-ad3c-85700e4ce6fd.jpeg',promo_version:'test',nav_labels:{cafe:{es:'Café original'}},visual_categories:{}},
    'sections/tostas':{title:'Tostas',group:'Desayunos'},
    'sections/tostas/items/avocado':{name:'Aguacate',name_en:'Avocado',desc:'Aguacate y sésamo',price:5.5,order:1},
    'sections/tostas/items/tomato':{name:'Tomate',price:4,order:2},
    'sections/tostas/items/hidden':{name:'No debe aparecer',hidden:true,price:8},
    'sections/extras-tostas':{title:'Extras (tostas/croissant)',group:'Desayunos'},
    'sections/extras-tostas/items/cheese':{name:'Queso Crema',price:2},
    'sections/especiales':{title:'Especiales',group:'Café'},
    'sections/especiales/items/latte':{name:'Latte prueba',price:3},
    'sections/cafe':{title:'Café',group:'Café'},
    'sections/cafe/items/coffee':{name:'Expreso',price:1.2},
    'sections/mini-pancakes':{title:'Mini Pancakes',group:'Poffertjes',base:{title:'Base',description:'12 mini pancakes',price:3.5}},
    'sections/mini-pancakes/toppings/nutella':{name:'Nutella',price:1.5},
    'sections/mini-pancakes/toppings/sugar':{name:'Azúcar',free:true,price:'Gratis:)'},
    'sections/hidden-section':{title:'Oculta',hidden:true},
    'sections/hidden-section/items/hidden-product':{name:'Oculto con sección',price:4}
  }));
  const must=(value,message)=>{if(!value)throw new Error(message);};
  const writes=[];const errors=[];let failReads=false;
  page.on('pageerror',e=>errors.push(e.message));
  const cors={'access-control-allow-origin':'*','content-type':'text/javascript'};
  await page.route('**/*.googleapis.com/**',r=>r.abort());
  await page.route('**/firebase.js',r=>r.fulfill({headers:cors,body:'export const db={};'}));
  await page.route('**/firebase-auth.js',r=>r.fulfill({headers:cors,body:`export const getAuth=()=>({});export const onAuthStateChanged=(a,cb)=>queueMicrotask(()=>cb({email:'prueba-local@example.test'}));export const signInWithEmailAndPassword=async()=>{};export const signOut=async()=>{};`}));
  await page.route('**/__menu_test__',async r=>{
    const {op,path,data,merge}=r.request().postDataJSON();
    if(failReads&&(op==='get'||op==='list'))return r.fulfill({status:503,body:'Unavailable'});
    const mergeInto=(target,source)=>{for(const [k,v] of Object.entries(source)){if(v==='__delete__')delete target[k];else if(v&&typeof v==='object'&&!Array.isArray(v)){target[k]??={};mergeInto(target[k],v);}else target[k]=v;}return target;};
    let result;
    if(op==='get')result=fixture.get(path)||null;
    else if(op==='list')result=[...fixture].filter(([k])=>k.startsWith(path+'/')&&k.split('/').length===path.split('/').length+1).map(([k,v])=>({id:k.split('/').at(-1),data:v}));
    else {
      writes.push({op,path});
      if(op==='delete')fixture.delete(path);
      else if(op==='update'){
        must(fixture.has(path),'Updating missing fixture doc');
        const target=fixture.get(path);
        for(const [key,value]of Object.entries(data)){const parts=key.split('.');let cursor=target;for(const p of parts.slice(0,-1)){cursor[p]??={};cursor=cursor[p];}const last=parts.at(-1);if(value==='__delete__')delete cursor[last];else cursor[last]=value;}
      }else fixture.set(path,merge?mergeInto(fixture.get(path)||{},data):data);
      result={ok:true};
    }
    await r.fulfill({json:result,headers:{'access-control-allow-origin':'*'}});
  });
  const firestore=`
    export const getFirestore=()=>({});
    export const collection=(parent,...parts)=>({path:[parent.path,...parts].filter(Boolean).join('/')});
    export const doc=collection;
    const call=async(op,ref,data,merge)=>{const r=await fetch('${origin}/__menu_test__',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op,path:ref.path,data,merge})});if(!r.ok)throw Error('Fixture unavailable');return r.json();};
    export const getDoc=async(ref)=>{const data=await call('get',ref);return {exists:()=>data!==null,data:()=>data};};
    export const getDocs=async(ref)=>({docs:(await call('list',ref)).map(x=>({id:x.id,data:()=>x.data}))});
    export const getDocFromServer=getDoc;export const getDocsFromServer=getDocs;
    export const setDoc=(r,d,o)=>call('set',r,d,o?.merge);
    export const updateDoc=(r,d)=>call('update',r,d);
    export const deleteDoc=(r)=>call('delete',r);
    export const addDoc=async(r,d)=>{const id='test-created';await call('set',{path:r.path+'/'+id},d);return {id};};
    export const serverTimestamp=()=> '2026-09-23T00:00:00Z';export const deleteField=()=> '__delete__';`;
  await page.route('**/firebase-firestore.js',r=>r.fulfill({headers:cors,body:firestore}));
  const saved=async()=>{await page.locator('dialog.editor-dialog').waitFor({state:'detached'});await page.waitForLoadState('networkidle');await page.locator('#sections .loading').waitFor({state:'hidden'});};
  await page.goto(origin+'/admin/');
  await page.getByRole('link',{name:'Cafés y especiales',exact:true}).click();
  await page.locator('#edit-item-especiales-latte').click();
  await page.getByLabel('Se sirve caliente',{exact:true}).check();
  await page.getByLabel('Se sirve frío',{exact:true}).check();
  await page.getByRole('button',{name:'Guardar',exact:true}).click();await saved();
  must(fixture.get('sections/especiales/items/latte').serving_temperatures.join(',')==='hot,cold','Temperature modes not saved');
  await page.locator('#edit-item-especiales-latte').click();
  must(await page.getByLabel('Se sirve frío',{exact:true}).isChecked(),'Temperature modes not restored');
  await page.getByLabel('Se sirve caliente',{exact:true}).uncheck();
  await page.getByRole('button',{name:'Guardar',exact:true}).click();await saved();
  must(fixture.get('sections/especiales/items/latte').serving_temperatures.join(',')==='cold','Hot mode not removed');
  await page.getByRole('link',{name:'Tostas y desayunos',exact:true}).click();
  await page.getByRole('button',{name:'Fotos y categorías',exact:true}).click();
  await page.getByRole('button',{name:'Editar Tostas y desayunos',exact:true}).click();
  await page.getByLabel('Nombre (ES)',{exact:true}).fill('Desayunos con foto');
  const photoResponse=await page.request.get(origin+'/assets/popup/rose_late.webp');
  await page.locator('#fld-image_url-file').setInputFiles({name:'foto-prueba.webp',mimeType:'image/webp',buffer:await photoResponse.body()});
  await page.locator('.photo-status').filter({hasText:'Foto preparada'}).waitFor();
  const adjust=async(key,value)=>page.locator(`[data-crop="${key}"]`).evaluate((el,v)=>{el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));},value);
  const geometry=async(locator)=>locator.evaluate(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el.querySelector('img'));return {ratio:r.width/r.height,position:s.objectPosition,transform:s.transform};});
  await adjust('zoom',1.7);await adjust('y',72);
  await page.locator('.crop-stage').scrollIntoViewIfNeeded();
  const bounds=await page.locator('.crop-stage').boundingBox();
  await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
  await page.mouse.down();await page.mouse.move(bounds.x+bounds.width/2+24,bounds.y+bounds.height/2+16);await page.mouse.up();
  const mobileCrop=JSON.parse(await page.locator('[name="image_frame"]').inputValue()).category.mobile;
  must(mobileCrop.y<72,'Photo drag did not move image');
  const mobileGeometry=await geometry(page.locator('.crop-stage'));
  await page.getByRole('combobox',{name:'Vista',exact:true}).selectOption('desktop');
  await adjust('zoom',1.25);await adjust('x',80);
  const desktopGeometry=await geometry(page.locator('.crop-stage'));
  await page.getByRole('combobox',{name:'Vista',exact:true}).selectOption('mobile');
  must(Number(await page.locator('[data-crop="zoom"]').inputValue())===1.7,'Devices overwrote each other');
  await page.screenshot({path:'output/playwright/encuadre-editor.png'});
  await page.getByRole('button',{name:'Guardar',exact:true}).click();await saved();
  const categoryImage=fixture.get('settings/menu').visual_categories.desayunos.image_url;
  must(categoryImage.startsWith('data:image/webp;')&&categoryImage.length<=98304,'Upload not compressed/stored');
  must(fixture.get('settings/menu').promo_enabled,'Saving category changed promo');
  must(fixture.get('settings/menu').nav_labels.cafe.es==='Café original','Saving category destroyed old nav');
  must(fixture.get('settings/menu').visual_categories.desayunos.image_frame.category.mobile.zoom===1.7,'Crop was not persisted');
  await page.getByRole('button',{name:'Editar Desayunos con foto',exact:true}).click();
  must(Number(await page.locator('[data-crop="zoom"]').inputValue())===1.7,'Saved crop was not restored');
  await page.getByRole('button',{name:'Restablecer esta vista',exact:true}).click();
  must(Number(await page.locator('[data-crop="zoom"]').inputValue())===1,'Reset failed');
  await page.getByRole('button',{name:'Cancelar',exact:true}).click();
  must(fixture.get('settings/menu').visual_categories.desayunos.image_frame.category.mobile.zoom===1.7,'Cancelled reset was saved');
  await page.getByRole('button',{name:'Editar Matcha',exact:true}).click();
  await page.getByLabel('O pega una URL / ruta de imagen').fill('assets/popup/rose_late.webp');
  await page.getByRole('button',{name:'Guardar',exact:true}).click();await saved();
  must(fixture.get('settings/menu').visual_categories.desayunos.image_url===categoryImage,'Saving second category lost first');
  await page.getByRole('button',{name:'Cambiar foto de portada',exact:true}).click();
  await page.getByLabel('O pega una URL / ruta de imagen').fill('assets/popup/rose_late.webp');
  await page.getByRole('button',{name:'Guardar',exact:true}).click();await saved();
  await page.locator('#edit-item-tostas-avocado').click();
  await page.getByLabel('O pega una URL / ruta de imagen').fill('assets/popup/rose_late.webp');
  await page.getByLabel('Precio',{exact:true}).fill('6,25');
  await page.getByRole('button',{name:'Guardar',exact:true}).click();await saved();
  must(fixture.get('sections/tostas/items/avocado').price==='6,25','Price not saved');
  must(fixture.get('sections/tostas/items/avocado').image_url==='assets/popup/rose_late.webp','Item image not saved');
  await page.locator('#edit-item-tostas-avocado').click();
  await page.getByRole('button',{name:'Quitar foto',exact:true}).click();
  await page.getByRole('button',{name:'Cancelar',exact:true}).click();
  must(fixture.get('sections/tostas/items/avocado').image_url,'Cancel saved photo removal');
  await page.setViewportSize({width:1200,height:1000});
  await page.screenshot({path:'output/playwright/editor-fotos.png',fullPage:true});
  await page.getByRole('link',{name:'Mini pancakes',exact:true}).click();
  await page.locator('#edit-sec-mini-pancakes').click();
  await page.getByLabel('O pega una URL / ruta de imagen').fill('assets/popup/rose_late.webp');
  await page.getByRole('button',{name:'Guardar',exact:true}).click();await saved();
  must(fixture.get('sections/mini-pancakes').base.image_url==='assets/popup/rose_late.webp','Base image not saved');
  must(fixture.get('sections/mini-pancakes').base.price==='3.5','Base price changed');
  await page.locator('#edit-top-mini-pancakes-sugar').click();
  must(await page.getByLabel('Topping gratuito').isChecked(),'Free flag lost in form');
  await page.getByRole('button',{name:'Guardar',exact:true}).click();await saved();
  must(fixture.get('sections/mini-pancakes/toppings/sugar').free,'Free flag lost on save');

  await page.goto(origin+'/');
  await page.getByRole('button',{name:'Ver carta',exact:true}).click();
  const sameGeometry=(a,b)=>Math.abs(a.ratio-b.ratio)<.015&&a.position===b.position&&a.transform===b.transform;
  const publicFrame=page.locator('.category[data-group="desayunos"] .photo-frame');
  must(sameGeometry(await geometry(publicFrame),desktopGeometry),'Desktop preview differs from menu crop');
  await page.setViewportSize({width:390,height:844});
  must(sameGeometry(await geometry(publicFrame),mobileGeometry),'Mobile preview differs from menu crop');
  must(await page.locator('.category .menu-photo').count()===2,'Saved category photos not read');
  must(await page.locator('.hero-photo').count()===1,'Saved hero photo not read');
  must((await page.locator('.brand-logo img').first().getAttribute('src'))==='logo_letras.png','Original logo missing');
  await page.locator('.category[data-group="pancakes"]').click();
  must(await page.locator('#product-dialog[open]').count()===1,'Single-product category did not open directly');
  must((await page.locator('#product-title').innerText())==='12 mini pancakes','Wrong category product opened');
  await page.keyboard.press('Escape');
  must(await page.locator('.category-grid').isVisible(),'Closing direct product did not return to categories');
  await page.locator('.category[data-group="desayunos"]').click();
  must(await page.locator('#product-dialog[open]').count()===0,'Multi-product category opened a product');
  await page.getByRole('button',{name:/Aguacate, 6,25/}).click();
  must(await page.locator('#product-dialog .detail-photo').count()===1,'Article photo missing');
  must(await page.locator('#product-dialog input').count()===0,'Selectable extras remain');
  must(await page.locator('#product-dialog .extra-info').count()===1,'Toast extras missing');
  must(await page.locator('#combination-total').count()===0,'Aggregate price remains');
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Mini pancakes',exact:true}).click();
  must(await page.locator('#product-dialog[open]').count()===1,'Single-product navigation did not open directly');
  must(await page.locator('#product-dialog .extra-info').count()===2,'Toppings missing');
  must(await page.locator('#product-dialog input').count()===0,'Selectable toppings remain');
  must((await page.locator('#product-dialog').innerText()).includes('Gratis'),'Free topping incorrectly priced');
  await page.keyboard.press('Escape');
  await page.getByRole('searchbox').fill('No debe aparecer');
  must(await page.locator('.product-card').count()===0,'Hidden product exposed');
  await page.getByRole('searchbox').fill('Oculto con sección');
  must(await page.locator('.product-card').count()===0,'Hidden section exposed');

  // Removal and new-section assignment must propagate to the public menu.
  await page.goto(origin+'/admin/');
  await page.locator('#edit-item-tostas-avocado').click();
  await page.getByRole('button',{name:'Quitar foto',exact:true}).click();
  await page.getByRole('button',{name:'Guardar',exact:true}).click();await saved();
  must(!fixture.get('sections/tostas/items/avocado').image_url,'Photo removal failed');
  await page.getByRole('button',{name:'+ Sección',exact:true}).click();
  await page.getByLabel('Título (ES)',{exact:true}).fill('Matcha de temporada');
  await page.getByLabel('Categoría en la nueva carta').selectOption('matcha');
  await page.getByRole('button',{name:'Crear',exact:true}).click();await saved();
  must(fixture.get('sections/matcha-de-temporada').visual_category==='matcha','New section category not saved');
  await page.getByRole('link',{name:'Matcha',exact:true}).click();
  await page.locator('#add-item-matcha-de-temporada').click();
  await page.getByLabel('Nombre (ES)',{exact:true}).fill('Matcha nuevo');
  await page.getByLabel('Precio',{exact:true}).fill('4.75');
  await page.getByRole('button',{name:'Crear',exact:true}).click();await saved();
  fixture.get('settings/menu').promo_enabled=false;
  await page.goto(origin+'/#matcha');
  await page.getByRole('button',{name:/Matcha nuevo, 4,75/}).waitFor();
  must(await page.locator('#promo-dialog[open]').count()===0,'Disabled promotion appears');
  await page.setViewportSize({width:390,height:844});
  must(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile overflow');
  failReads=true;
  await page.reload();
  await page.getByRole('button',{name:'Reintentar',exact:true}).waitFor();
  must(await page.locator('.product-card').count()===0,'Old menu resurrected after read failure');
  failReads=false;await page.getByRole('button',{name:'Reintentar',exact:true}).click();
  await page.getByRole('button',{name:/Matcha nuevo, 4,75/}).waitFor();
  must(errors.length===0,'Browser errors: '+errors.join('; '));
  return {passed:true,fixtureWrites:writes.length,productionWrites:0,checks:'photo upload/URL/remove/cancel, category and hero photos, item/base CRUD, preserved popup/legacy settings, free toppings, live reads, hidden products, new categories, read failure/retry, mobile overflow, no selection or total'};
}
