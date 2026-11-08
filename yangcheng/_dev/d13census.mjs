const S = `(()=>{
  var sc=window.__yc.scene, out={inst:[],groups:{},blocksKids:0,farR:[]};
  sc.children.forEach(function(o){
    if(o.isInstancedMesh) out.inst.push(o.count+":"+(o.material&&o.material.color?o.material.color.getHexString():'-'));
    else if(o.isGroup){ out.groups[o.name||o.type]=(out.groups[o.name||o.type]||0)+o.children.length; }
  });
  sc.traverse(function(o){ if(o.name==="blocks"){ out.blocksKids=o.children.length;
    out.blk=o.children.map(function(c){return [Math.round(c.position.x),Math.round(c.position.z),c.children.length];}); }
  });
  return out;
})()`;
console.log("CEN", S);
