const S = `(()=>{
  var T=window.THREE, sc=window.__yc.scene;
  function top(x,z){
    var rc=new T.Raycaster(new T.Vector3(x,60,z), new T.Vector3(0,-1,0), 0, 120);
    var h=rc.intersectObjects(sc.children,true);
    return h.slice(0,3).map(function(a){
      var o=a.object, m=o.material;
      return Math.round(a.point.y*100)/100+":"+((m&&m.color)?m.color.getHexString():"-")+":"+(o.type[0]);
    });
  }
  return {a:top(95,-320), b:top(105,-320), c:top(118,-320), d:top(105,-200)};
})()`;
console.log("XP", S);
