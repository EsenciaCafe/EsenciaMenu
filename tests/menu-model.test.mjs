import test from 'node:test';
import assert from 'node:assert/strict';
import {normaliseMenu,visualCategories,safeImageURL,MAX_IMAGE_LENGTH} from '../shared/menu-model.js';
import {normaliseFrame,frameStyle,draggedFrame} from '../shared/photo-frame.js';

test('pancake toppings reorder alphabetically after adding, renaming, hiding and restoring',()=>{
  const section={id:'mini-pancakes',toppings:[{id:'n',name:'Nutella',order:1},{id:'a',name:'Azúcar',order:99}]};
  const names=()=>normaliseMenu([section])[0].toppings.map(t=>t.name);
  assert.deepEqual(names(),['Azúcar','Nutella']);
  section.toppings.push({id:'c',name:'Chocolate',order:0});
  assert.deepEqual(names(),['Azúcar','Chocolate','Nutella']);
  section.toppings[0].hidden=true;
  assert.deepEqual(names(),['Azúcar','Chocolate']);
  section.toppings[0].hidden=false;
  section.toppings[0].name='Almendras';
  assert.deepEqual(names(),['Almendras','Azúcar','Chocolate']);
});

test('crop defaults remain centered and invalid or extreme values are clamped',()=>{
  assert.deepEqual(normaliseFrame(),{x:50,y:50,zoom:1});
  assert.deepEqual(normaliseFrame({x:-200,y:1000,zoom:9}),{x:0,y:100,zoom:3});
  assert.ok(!frameStyle({product:{mobile:{x:'bad;css',zoom:Infinity}}},'product').includes('bad;css'));
});
test('dragging follows image overflow, retains position on an axis without overflow and clamps edges',()=>{
  assert.deepEqual(draggedFrame({x:50,y:50,zoom:1},10,20,200,100,400,400),{x:50,y:30,zoom:1});
  assert.deepEqual(draggedFrame({x:50,y:50,zoom:2},1000,-1000,200,100,400,400),{x:0,y:100,zoom:2});
});

test('live edits preserve prices and hide deleted/hidden entries rather than resurrecting the snapshot',()=>{
  const baseline=[{id:'cafe',items:[{id:'coffee',name:'Café',price:1.5,allergens:{contains:['Leche'],traces:['Soja'],pending:''}},{id:'deleted',name:'Removed'}]}];
  const live=[{id:'cafe',items:[{id:'coffee',name:'Café',price:'2,00'},{id:'hidden',name:'Hidden',hidden:true}],toppings:[{id:'sugar',name:'Azúcar',free:true,price:'Gratis:)'}]},{id:'secret',hidden:true}];
  const menu=normaliseMenu(live,baseline);
  assert.equal(menu.length,1);assert.equal(menu[0].items.length,1);
  assert.equal(menu[0].items[0].price,'2,00');
  assert.deepEqual(menu[0].items[0].allergens.contains,['Leche']);
  assert.equal(menu[0].toppings[0].free,true);
  live[0].items[0].desc='Nueva receta';
  assert.deepEqual(normaliseMenu(live,baseline)[0].items[0].allergens.contains,[]);
});

test('new sections are placed in the selected visual category and category names/images are shared',()=>{
  const groups=visualCategories({visual_categories:{matcha:{name_es:'Nuestros matchas',image_url:'https://example.com/matcha.webp'}}},[{id:'new-section',visual_category:'matcha',group:'Café'},{id:'extras-bebidas',visual_category:'matcha'}]);
  assert.deepEqual(groups.find(g=>g.id==='matcha').sections,['new-section']);
  assert.equal(groups.find(g=>g.id==='matcha').name[0],'Nuestros matchas');
  assert.equal(groups.find(g=>g.id==='matcha').image_url,'https://example.com/matcha.webp');
});

test('base images survive normalisation and a recipe edit invalidates the inherited draft',()=>{
  const live=[{id:'mini-pancakes',title:'Mini pancakes',base:{price:0,image_url:'https://example.com/pancakes.jpg',allergens_revision_required:true}}];
  const baseline=[{id:'mini-pancakes',items:[{id:'base',allergens:{contains:['Leche']}}]}];
  const base=normaliseMenu(live,baseline)[0].items[0];
  assert.equal(base.price,0);assert.equal(base.image_url,'https://example.com/pancakes.jpg');assert.deepEqual(base.allergens.contains,[]);
});

test('image validation accepts compact raster photos and rejects active/oversized payloads',()=>{
  assert.equal(safeImageURL('javascript:alert(1)'), '');
  assert.equal(safeImageURL('data:image/svg+xml,<svg></svg>'), '');
  assert.equal(safeImageURL('data:text/html;base64,AAAA'), '');
  assert.ok(safeImageURL('data:image/webp;base64,AAAA'));
  assert.equal(safeImageURL('data:image/webp;base64,'+'A'.repeat(MAX_IMAGE_LENGTH)), '');
});
