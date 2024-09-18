const canvas = document.getElementById("display");
const outputEl = document.getElementById("output");
const ctx = canvas.getContext("2d");

let width = canvas.width = window.innerWidth;
let height = canvas.height = window.innerHeight;

// just some spacers
let spX = width / 20;
let spY = height / 20;

let keyPressed = [];
let events = [];

let gripRadius = 12;
let playerSpeed = 0.1;
let jumpForce = 0.4;
let grappleRange = mag(vec(spX, spY)) * 3;
let shotCooldown = 1; // seconds
let bulletSpeed = grappleRange / 12;

let playerOne = {
  p: vec(spX, spY),
  a: vec(0, 0),
  lp: vec(spX, spY),
  width: spX / 2, height: spY, 
  visible: true,
  color:       "rgba(255, 0, 0, 1.0)",
  borderColor: "rgba(255, 0, 0, 0.2)",
  border: gripRadius,
  cooldown: 0,
  isPlayer: true,
  isGrappling: false,
  grapplePoint: null,
  score: 0
};

let playerTwo = {
  p: vec(width - spX, spY),
  a: vec(0, 0),
  lp: vec(width - spX, spY),
  width: spX / 2, height: spY, 
  visible: true,
  color:       "rgba(191, 255, 255, 1.0)",
  borderColor: "rgba(191, 255, 255, 0.2)",
  border: gripRadius,
  cooldown: 0,
  isPlayer: true,
  isGrappling: false,
  grapplePoint: null,
  score: 0
};

let wall = (x, y, w, h) => ({ p: vec(x + w / 2, y + h / 2), width: w, height: h, immovable: true, visible: true });
let boundingBoxes = [
  wall(0, height - 1, width, spY), // ground
  wall(0, -spY + 1, width, spY), // ceiling
  wall(-spX + 1, 0, spX, height),
  wall(width - 1, 0, spX, height),
];

let grapplingPoints = [];

for (let i = -1; i <= 1; i++) {
  for (let j = -1; j <= 1; j++) {
    grapplingPoints.push({ x: width / 2 + i * (width - spY * 4) / 3, y: height / 2 + j * (height - spY * 4) / 3 })
  }
}

let objects = [
  playerOne, 
  playerTwo, 
  ...boundingBoxes
];

let forces = [
  (object) => ({ x: 0, y: 0.1 }), // gravity
  (object) => { // friction
    if (object?.immovable) return { x: 0, y: 0 };

    let vel = sub(object.p, object.lp);
    let frictionScale = 0.01;
    if (checkGrip(object)) frictionScale *= 1.2;
    if (object?.isGrappling) frictionScale *= 0.9;
    return scale(vel, -frictionScale);
  },
];

let lastTime = performance.now();

function init() {
  document.addEventListener("keydown", e => events.push({ key: e.key.toLowerCase(), val: true }));
  document.addEventListener("keyup", e => events.push({ key: e.key.toLowerCase(), val: false }));

  spawnEmerald();
  spawnEmerald();
  spawnEmerald();

  loop();
}

function spawnEmerald() {
  objects.push({
    p: vec(Math.random() * width, Math.random() * height),
    immovable: true,
    width: 12, height: 12,
    visible: true,
    color: "#31ed31",
    isEmerald: true,
  });
}

function loop() {
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, width, height);

  let t = performance.now();
  dt = t - lastTime;
  lastTime = t;

  if (dt > 100) return loop();

  for (let i = 0; i < objects.length; i++) {
    objects[i].id = i;
  }

  handleInput(dt / 10);

  for (let i = 0; i < objects.length; i++) {
    updateObject(objects[i], dt / 10);
  }

  // collisions
  for (let i = 0; i < objects.length; i++) {
    if (objects[i]?.immovable) continue;
    if (objects[i]?.isBullet) continue;

    for (let j = 0; j < objects.length; j++) {
      if (i == j) continue;
      if (objects[j].parent == objects[i].id) continue;
      resolveCollision(objects[i], objects[j]);
    }
  }

  for (let i = objects.length - 1; i >= 0; i--) {
    if (objects[i]?.collected) {
      objects[i] = objects[objects.length - 1];
      objects.pop();

      spawnEmerald();
    }
  }

  for (let i = 0; i < objects.length; i++) {
    drawObject(objects[i]);
  }

  renderGrappleVisualizer();

  ctx.fillStyle = "white";
  for (let i = 0; i < grapplingPoints.length; i++) {
    ctx.fillRect(grapplingPoints[i].x - 2, grapplingPoints[i].y - 2, 4, 4);
  }

  requestAnimationFrame(loop);
}

function renderGrappleVisualizer() {
  ctx.setLineDash([4, 4]);

  drawGrappleRange(playerOne);
  drawGrappleRange(playerTwo);

  drawClosestGrapple(playerOne);
  drawClosestGrapple(playerTwo);

  ctx.setLineDash([]);
}

function drawGrappleRange(player) {
  ctx.strokeStyle = player.color;
  ctx.beginPath();
  ctx.arc(player.p.x, player.p.y, grappleRange, 0, Math.PI * 2);
  ctx.stroke();
}

function drawClosestGrapple(player) {
  let distances = grapplingPoints.map(point => dist(player.p, point));
  let grapplePoint = player.isGrappling ? player.grapplePoint : grapplingPoints[distances.indexOf(Math.min(...distances))];

  if (!grapplePoint) return;
  if (dist(grapplePoint, player.p) > grappleRange) return;

  ctx.setLineDash([]);

  if (!player.isGrappling) ctx.setLineDash([2, 2]);

  ctx.strokeStyle = player.color;
  ctx.beginPath();
  ctx.arc(grapplePoint.x, grapplePoint.y, 6, 0, Math.PI * 2);
  ctx.stroke();

  if (!player.isGrappling) ctx.setLineDash([0, 12, 4]);

  ctx.beginPath();
  ctx.moveTo(player.p.x, player.p.y);
  ctx.lineTo(grapplePoint.x, grapplePoint.y);
  ctx.stroke();
}

function handleInput(dt) {
  // handling event stream
  events.forEach(event => {
    keyPressed[event.key] = event.val;
  });

  updatePlayer(playerOne, playerTwo, { left: "a", right: "d", up: "w", /* shoot: "x", */ grapple: "c" });
  updatePlayer(playerTwo, playerOne, { left: "j", right: "l", up: "i", /* shoot: ".", */ grapple: "/" });
}

function updatePlayer(player, enemy, binds) {
  let hasGrip = checkGrip(player);

  if (keyPressed[binds.left]) player.a.x -= playerSpeed;
  if (keyPressed[binds.right]) player.a.x += playerSpeed;
  if (keyPressed[binds.up]) {
    if (hasGrip) player.a.y -= jumpForce;
  }

  // if (keyPressed[binds.shoot] && player.cooldown <= 0) {
  //   let bullet = {
  //     p: copy(player.p),
  //     a: scale(norm(sub(enemy.p, player.p)), bulletSpeed),
  //     lp: copy(player.p),
  //     width: 2,
  //     height: 2,
  //     visible: true,
  //     isBullet: true,
  //     color: player.color,
  //     parent: player.id
  //   };

  //   objects.push(bullet);

  //   player.cooldown = shotCooldown;
  // }

  if (!keyPressed[binds.grapple]) {
    player.isGrappling = false;
    return;
  } else if (player.isGrappling) {
    if (dist(player.p, player.grapplePoint) > grappleRange) {
      player.isGrappling = false;
    }

    return;
  }

  let distances = grapplingPoints.map(point => dist(player.p, point));
  let closest = grapplingPoints[distances.indexOf(Math.min(...distances))];

  if (dist(closest, player.p) > grappleRange) return;

  player.isGrappling = true;
  player.grapplePoint = closest;
}

function checkGrip(object) {
  let collider = {
    p: object.p,
    width: object.width + gripRadius * 2, height: object.height + gripRadius * 2
  };

  for (let i = 0; i < objects.length; i++) {
    if (object.id == objects[i].id) continue;
    if (checkCollision(objects[i], collider)) {
      return true;
    }
  }

  return false;
}

function checkCollision(obj1, obj2) {
  let m = 10000000;
  let rect = [
    vec(-m, -m), vec(m, m)
  ];

  for (let i = 0; i < rect.length; i++) {
    let p = rect[i];

    rect[i] = pointInside(pointInside(pointInside(p, obj1), obj2), obj1);
  }

  let size = abs(sub(rect[0], rect[1]));

  if (size.x == 0 || size.y == 0) return false;
  return true;
}

function resolveCollision(obj1, obj2) {
  let m = 10000000;
  let rect = [
    vec(-m, -m), vec(m, m)
  ];

  for (let i = 0; i < rect.length; i++) {
    let p = rect[i];

    rect[i] = pointInside(pointInside(pointInside(p, obj1), obj2), obj1);
  }

  let size = abs(sub(rect[0], rect[1]));

  if (size.x == 0 || size.y == 0) return;

  let w1 = 1;
  let w2 = 1;

  if (obj2?.immovable) {
    w1 = 1;
    w2 = 0;

    if (obj2?.isEmerald && obj1.score !== undefined) {
      obj2.collected = true;
      obj1.score++;
    }
  }

  if (obj2?.isBullet) {
    w1 = 0;
    w2 = 1;
  }

  // resolve collision the easier way
  if (size.y < size.x) {
    let sign = 1;
    if (obj1.p.y > obj2.p.y) sign *= -1;
    obj1.p.y -= sign * size.y * w1;
    obj2.p.y += sign * size.y * w2;
  } else {
    let sign = 1;
    if (obj1.p.x > obj2.p.x) sign *= -1;
    obj1.p.x -= sign * size.x * w1;
    obj2.p.x += sign * size.x * w2;
  }
}

function pointInside(point, obj) {
  return vec(
    Math.max(obj.p.x - obj.width / 2, Math.min(point.x, obj.p.x + obj.width / 2)),
    Math.max(obj.p.y - obj.height / 2, Math.min(point.y, obj.p.y + obj.height / 2))
  );
}

function drawObject(object) {
  if (object?.isBullet) {
    let vel = scale(norm(sub(object.p, object.lp)), 20);
    let p2 = sub(object.p, vel);
    ctx.lineWidth = 4;
    ctx.strokeStyle = object.color;
    ctx.beginPath();
    ctx.moveTo(object.p.x, object.p.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.lineWidth = 1;

    return;
  }

  if (object?.isEmerald) {
    ctx.save();
    ctx.translate(object.p.x, object.p.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = object?.color || "white";
    ctx.fillRect(-object.width / 2, -object.height / 2, object.width, object.height);
    ctx.restore();

    return;
  }

  if (!object?.visible) return;

  ctx.fillStyle = object?.color || "white";
  ctx.fillRect(object.p.x - object.width / 2, object.p.y - object.height / 2, object.width, object.height);

  if (!object?.border) return;

  ctx.fillStyle = object.borderColor;
  ctx.fillRect(object.p.x - object.width / 2 - object.border, object.p.y - object.height / 2 - object.border, object.width + object.border * 2, object.height + object.border * 2);

  if (object.score !== undefined) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "white";
    ctx.font = `${(object.width * 1.2) / (object.score.toString().length)}px monospace`;
    
    ctx.fillText(object.score, object.p.x, object.p.y);
  }
}

function updateObject(object, dt) {
  if (object?.immovable) return;

  let vel = sub(object.p, object.lp);

  if (!object?.isBullet){
    for (let i = 0; i < forces.length; i++) {
      object.a = add(object.a, forces[i](object));
    }
  }

  object.lp = copy(object.p);
  object.p = add(object.p, add(scale(object.a, dt / 2), vel));
  object.a = vec(0, 0);

  if (object.isPlayer) updatePlayerObject(object, dt);
}

function updatePlayerObject(player, dt) {
  player.cooldown = Math.max(player.cooldown - dt / 100, 0);

  if (player.isGrappling) {
    let grappleDistance = dist(player.lp, player.grapplePoint);
    let distanceMoved = dist(player.p, player.lp);
    let grappleDirection = norm(sub(add(scale(norm(sub(player.p, player.grapplePoint)), grappleDistance), player.grapplePoint), player.lp));

    player.p = add(player.lp, scale(grappleDirection, distanceMoved));
  }
}

function output(text, reset) {
  if (reset) outputEl.textContent = "";
  outputEl.textContent += JSON.stringify(text) + "\n";
}

function vec(x, y) { return { x, y }; }
function add(v, w) { return vec(v.x + w.x, v.y + w.y); }
function sub(v, w) { return vec(v.x - w.x, v.y - w.y); }
function mag(v) { return Math.sqrt(v.x * v.x + v.y * v.y); }
function scale(v, s) { return vec(v.x * s, v.y * s); }
function norm(v) { return scale(v, 1 / mag(v)); }
function copy(v) { return vec(v.x, v.y); }
function equals(v, w) { return v.x == w.x && v.y == w.y; }
function abs(v) { return vec(Math.abs(v.x), Math.abs(v.y)); }
function dist(v, w) {
  let dx = v.x - w.x;
  let dy = v.y - w.y;
  return Math.sqrt(dx * dx + dy * dy);
}

init();
