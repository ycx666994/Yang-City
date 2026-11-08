const S = `(()=>{
  var T=window.THREE, sc=window.__yc.scene, ok=[];
  sc.traverse(function(o){ if(o.isMesh && o.geometry && o.geometry.attributes && o.geometry.attributes.position) ok.push(o); });
  var out=[];
  [[0,0],[-300,0],[300,0],[0,-300],[0,300],[-200,-200],[200,200],[-430,0],[430,0],[0,-430],[0,430]].forEach(function(p){
    var rc=new T.Raycaster(new T.Vector3(p[0],300,p[1]), new T.Vector3(0,-1,0), 0, 600);
    var h=rc.intersectObjects(ok,false);
    out.push(p[0]+","+p[1]+"="+(h.length?Math.round(h[h.length-1].point.y*10)/10:"-"));
  });
  return out.join(" | ");
})()`;
console.log("T", S);
