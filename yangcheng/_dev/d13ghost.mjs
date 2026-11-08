const S = `(()=>{
  var T=window.THREE, sc=window.__yc.scene;
  function shoot(x,z){
    var rc=new T.Raycaster(new T.Vector3(x,300,z), new T.Vector3(0,-1,0), 0, 400);
    var hits=rc.intersectObjects(sc.children,true);
    return hits.slice(0,5).map(function(h){
      var o=h.object, info={y:Math.round(h.point.y*10)/10, col:(o.material&&o.material.color)?o.material.color.getHexString():'-', t:o.type};
      if(o.isInstancedMesh){var m=new T.Matrix4();o.getMatrixAt(h.instanceId,m);
        var p=new T.Vector3(),q=new T.Quaternion(),s=new T.Vector3();m.decompose(p,q,s);
        info.ip=[Math.round(p.x),Math.round(p.y*10)/10,Math.round(p.z)];
        info.is=[Math.round(s.x*10)/10,Math.round(s.y*10)/10,Math.round(s.z*10)/10];
        info.id=h.instanceId;}
      var pr=(o.geometry&&o.geometry.parameters)||{};
      info.gp=JSON.stringify(pr).slice(0,90);
      return info;
    });
  }
  return {a:shoot(118,-363), b:shoot(126,-296), c:shoot(112,-240)};
})()`;
console.log("GHOST", S);
