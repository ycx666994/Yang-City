/* Six distinct 3D lobby identities; exhibit learning stays in its existing independent page. */
(function () {
  "use strict";
  var T = window.THREE, P = window.YC3D_P, B = window.YC3D_B;
  if (!T || !P || !B) return;
  var stone = function (color) { return P.matStone({ base: color, roughness: 0.42 }); };
  function box(g,w,h,d,x,y,z,mat){var m=new T.Mesh(new T.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;g.add(m);return m;}
  function bar(g,a,b,width,mat){var av=new T.Vector3(a[0],a[1],a[2]),bv=new T.Vector3(b[0],b[1],b[2]),m=new T.Mesh(new T.BoxGeometry(width,av.distanceTo(bv),width),mat);m.position.copy(av).add(bv).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),bv.sub(av).normalize());m.castShadow=true;g.add(m);return m;}
  function build(ctx){
    var T=ctx.THREE,P=ctx.P,B=ctx.B,hall=ctx.cfg,room=new T.Group(),mat=stone(hall.style==="archive"?0xe6e1d7:hall.style==="greenhouse"?0xe4eee6:0xf0f2ee),accent=P.matGold();
    var w=96,d=84,height=22;
    room.add(P.shell({w:w,d:d,h:height,ceiling:false,pal:{stone:hall.style==="archive"?0xe5dfd4:0xf0f2ee,floor:0xdfe7e7},grid:8,openings:[
      {side:"front",x:0,w:11,h:10},{side:"back",x:-31,w:7,h:9},{side:"back",x:-16,w:7,h:9},{side:"back",x:0,w:7,h:9},{side:"back",x:16,w:7,h:9},{side:"back",x:31,w:7,h:9}
    ]}));
    box(room,96,.55,2,0,height,0,accent);
    if(hall.style==="vault"){
      room.add(P.vault({w:90,d:80,y:21,rise:15,opening:.20}));room.add(P.skylight({w:16,d:70,y:35}));
      room.add(P.colonnade({x:-41,n:9,span:9,h:16,r:.72}));room.add(P.colonnade({x:41,n:9,span:9,h:16,r:.72}));
      room.add(P.balcony({w:90,d:74,y:10}));
    }else if(hall.style==="archive"){
      for(var ax=-1;ax<=1;ax++){var wall=box(room,10,14,42,ax*28,7,-7,mat);wall.rotation.y=ax*.08;box(room,12,.65,45,ax*28,14.2,-7,accent);}
      for(var ar=0;ar<5;ar++){var ang=ar*Math.PI/5;bar(room,[-43,19,-26],[43,19,-26],.65,accent);}
      room.add(P.skylight({w:20,d:46,y:20}));
    }else if(hall.style==="hive"){
      for(var hi=0;hi<16;hi++){var a=hi*Math.PI/8,x=Math.cos(a)*35,z=Math.sin(a)*29;var post=new T.Mesh(new T.CylinderGeometry(.55,.78,15,6),mat);post.position.set(x,7.5,z);post.castShadow=true;room.add(post);}
      for(var ring=0;ring<3;ring++){var tor=new T.Mesh(new T.TorusGeometry(31-ring*4,.24,6,64),accent);tor.rotation.x=Math.PI/2;tor.position.y=12+ring*2;room.add(tor);}
      room.add(P.skylight({w:34,d:30,y:19}));
    }else if(hall.style==="greenhouse"){
      room.add(P.vault({w:88,d:78,y:19,rise:17,opening:.11}));room.add(P.skylight({w:10,d:72,y:35}));
      for(var rib=-4;rib<=4;rib++){var x2=rib*10,top=19+Math.sqrt(Math.max(0,1-(x2/48)*(x2/48)))*17;bar(room,[x2,2,-38],[x2,top,0],.48,accent);bar(room,[x2,top,0],[x2,2,38],.48,accent);}
      for(var tree=0;tree<13;tree++){var tx=-37+(tree%7)*12,tz=tree<7?16:-17;box(room,3,.8,3,tx,.4,tz,accent);bar(room,[tx,.8,tz],[tx,4,tz],.42,stone(0x8c7054));var crown=new T.Mesh(new T.SphereGeometry(2.4,8,6),new T.MeshStandardMaterial({color:0x729879,roughness:.85}));crown.position.set(tx,6,tz);room.add(crown);}
    }else if(hall.style==="observatory"){
      for(var o=-2;o<=2;o++){var oa=o*.28;bar(room,[-39,2,-31],[0,20,-7],1.3,accent);bar(room,[0,20,-7],[39,2,-31],1.3,accent);}
      var ring1=new T.Mesh(new T.TorusGeometry(31,.55,8,80),accent);ring1.rotation.x=Math.PI/2;ring1.position.y=17;room.add(ring1);
      var ring2=new T.Mesh(new T.TorusGeometry(24,.4,8,72),stone(0xd9e6e9));ring2.rotation.x=Math.PI/2;ring2.rotation.z=.32;ring2.position.y=13;room.add(ring2);
      room.add(P.skylight({w:26,d:28,y:20}));
    }else{
      room.add(P.vault({w:86,d:78,y:20,rise:13,opening:.25}));room.add(P.skylight({w:18,d:64,y:33}));
      room.add(P.colonnade({x:-41,n:7,span:11,h:16,r:.9}));room.add(P.colonnade({x:41,n:7,span:11,h:16,r:.9}));
      for(var wing=-1;wing<=1;wing+=2){var bridge=P.archway({x:wing*20,z:-40,w:8,h:8,label:wing<0?"证据长廊":"实验长廊"});room.add(bridge);}
    }
    var dialBase=new T.Mesh(new T.CylinderGeometry(7,8,1,48),stone(0xf7f4ec));dialBase.position.set(0,.5,-2);dialBase.receiveShadow=true;room.add(dialBase);
    var dial=new T.Mesh(new T.TorusGeometry(5,.16,10,72),accent);dial.position.set(0,4,-2);room.add(dial);
    var dialFace=new T.Mesh(new T.CircleGeometry(4.8,48),new T.MeshStandardMaterial({color:hall.accent,roughness:.45,metalness:.1}));dialFace.position.set(0,4,-1.82);room.add(dialFace);
    var title=P.label({title:hall.name,sub:hall.question,w:20,h:3,x:0,y:13.5,z:-41.2,background:"#fbfcf8"});room.add(title);
    var n=hall.exhibits.length,radiusX=38,radiusZ=31;
    hall.exhibits.forEach(function(ex,i){
      var a=-Math.PI*.82+i/(Math.max(1,n-1))*Math.PI*1.64,x=Math.sin(a)*radiusX,z=-Math.cos(a)*radiusZ;
      var group=P.archway({x:x,z:z,w:Math.min(8,ex.title.length*.34+3),h:8,t:.6,label:ex.title,rot:Math.PI-a});
      group.userData.onOver=function(){if(window.__YCMuseumHint)window.__YCMuseumHint(ex);};
      group.userData.onOut=function(){if(window.__YCMuseumHint)window.__YCMuseumHint(null);};
      group.userData.onClick=function(){if(window.__YCMuseumEnter)window.__YCMuseumEnter(ex.id);};room.add(group);
    });
    hall.guides.forEach(function(gd,i){
      var x=-13+i*13,z=20,fig=B.character({asset:gd.asset,scale:.86}),ped=new T.Group();ped.add(fig);
      var base=new T.Mesh(new T.CylinderGeometry(1.45,1.7,.32,24),stone(0xe3e7e3));base.position.y=.16;ped.add(base);
      var plaque=P.label({title:gd.name,sub:gd.role,w:3.2,h:1.05,x:0,y:2.8,z:.72,background:"#fbfcf8"});ped.add(plaque);ped.position.set(x,0,z);ped.userData.guide=gd;ped.userData.fig=fig;
      ped.userData.onClick=function(){if(window.__YCMuseumGuide)window.__YCMuseumGuide(gd.id);};room.add(ped);
    });
    room.userData.atrium={userData:{rings:[dial]}};
    return room;
  }
  window.YCMUSEUM_BUILD_LOBBY=build;
})();
