import Phaser from 'phaser';

type TouchControl = 'left' | 'right' | 'thrust' | 'fire' | 'ability';
type MissionType = 'clear' | 'survive' | 'boss';
export type GameLevelId = 'satellite-defense' | 'boss-rush' | 'asteroid-classic';
export type ShipId = 'vector' | 'bastion' | 'phantom';

export const SHIP_IDS: ShipId[] = ['vector', 'bastion', 'phantom'];

export const SHIP_LOADOUTS = {
  vector: { name: 'Vetor', role: 'INTERCEPTOR', ability: 'OVERDRIVE', description: 'Aceleração extrema e disparos rápidos por 2,5 s.', maxSpeed: 300, turnSpeed: 4.3, acceleration: 440, shotDelay: 155 },
  bastion: { name: 'Bastião', role: 'BLINDADO', ability: 'CAMPO DE FORÇA', description: 'Bloqueia um impacto. Recarga de 8 s.', maxSpeed: 220, turnSpeed: 3.25, acceleration: 350, shotDelay: 255 },
  phantom: { name: 'Fantasma', role: 'FÁSICO', ability: 'SALTO FÁSICO', description: 'Avança e fica intangível por 0,9 s. Recarga de 6 s.', maxSpeed: 340, turnSpeed: 4.8, acceleration: 500, shotDelay: 185 },
} as const satisfies Record<ShipId, { name: string; role: string; ability: string; description: string; maxSpeed: number; turnSpeed: number; acceleration: number; shotDelay: number }>;

export class OrbitScene extends Phaser.Scene {
  private ship!: Phaser.Physics.Arcade.Sprite;
  private satellite!: Phaser.GameObjects.Image;
  private satelliteCollider!: Phaser.Physics.Arcade.Sprite;
  private shieldAura!: Phaser.GameObjects.Arc;
  private rocks!: Phaser.Physics.Arcade.Group;
  private bullets!: Phaser.Physics.Arcade.Group;
  private enemyShots!: Phaser.Physics.Arcade.Group;
  private aliens!: Phaser.Physics.Arcade.Group;
  private stars!: Phaser.GameObjects.Group;
  private spaceBackdrop!: Phaser.GameObjects.Graphics;
  private nebulaLayer!: Phaser.GameObjects.Graphics;
  private satelliteBackdrop!: Phaser.GameObjects.Image;
  private planets!: Phaser.GameObjects.Image[];
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private score = 0;
  private lives = 3;
  private wave = 1;
  private started = false;
  private paused = false;
  private invulnerableUntil = 0;
  private lastShotAt = 0;
  private touch = new Set<TouchControl>();
  private shipId: ShipId = 'vector';
  private levelId: GameLevelId = 'satellite-defense';
  private satelliteHealth = 100;
  private satelliteInvulnerableUntil = 0;
  private abilityTouchWasDown = false;
  private abilityReady = true;
  private nextAbilityAt = 0;
  private overdriveUntil = 0;
  private overdriveActive = false;
  private shieldUntil = 0;
  private nextAlienSpawnAt = 0;
  private lastAbilitySecondsRemaining = -1;
  private nextBossShotAt = 0;
  private missionType: MissionType = 'clear';
  private missionUntil = 0;
  private missionSecondsRemaining = -1;
  private runStartedAt = 0;

  constructor() {
    super('OrbitScene');
  }

  preload() {
    this.load.svg('satellite-defense-bg', '/assets/satellite-defense-background.svg', { width: 1600, height: 900 });
    this.load.svg('satellite-sprite', '/assets/satellite-sprite.svg', { width: 512, height: 512 });
  }

  create() {
    this.physics.world.setBounds(0, 0, this.scale.width, this.scale.height);
    this.makeTextures();
    this.createStars();
    this.satelliteBackdrop = this.add.image(this.scale.width / 2, this.scale.height / 2, 'satellite-defense-bg').setDepth(-11).setVisible(false);
    this.layoutSatelliteBackground(this.scale.width, this.scale.height);
    this.ship = this.physics.add.sprite(this.scale.width / 2, this.scale.height / 2, 'ship-vector');
    this.ship.setCircle(12, 8, 8).setDamping(true).setDrag(0.96).setMaxVelocity(300).setCollideWorldBounds(false);
    this.ship.setActive(false).setVisible(false);
    this.satellite = this.add.image(this.scale.width / 2, this.scale.height / 2, 'satellite-sprite')
      .setDisplaySize(128, 128).setDepth(2.8).setVisible(false).setActive(false);
    this.satelliteCollider = this.physics.add.sprite(this.scale.width / 2, this.scale.height / 2, 'satellite-hitbox');
    this.satelliteCollider.setDisplaySize(64, 64).setVisible(false).setActive(false).setImmovable(true);
    this.satelliteCollider.setCircle(24, 8, 8);
    (this.satelliteCollider.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    this.shieldAura = this.add.circle(0, 0, 34, 0x72e8d0, 0.16).setStrokeStyle(2, 0x8affea, 0.85).setDepth(1).setVisible(false);
    this.add.graphics().setName('engine-flame').setDepth(2);
    this.ship.setDepth(3);

    this.rocks = this.physics.add.group({ runChildUpdate: false });
    this.bullets = this.physics.add.group({ defaultKey: 'bullet', maxSize: 24 });
    this.enemyShots = this.physics.add.group({ defaultKey: 'bullet-vector', maxSize: 12 });
    this.aliens = this.physics.add.group({ defaultKey: 'alien-ufo', maxSize: 1, runChildUpdate: false });
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,SPACE,P,E') as Record<string, Phaser.Input.Keyboard.Key>;

    this.physics.add.overlap(this.bullets, this.rocks, this.hitRock as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
    this.physics.add.overlap(this.bullets, this.aliens, this.hitAlien as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
    this.physics.add.overlap(this.ship, this.rocks, this.shipHit as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
    this.physics.add.overlap(this.ship, this.aliens, this.shipHit as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
    this.physics.add.overlap(this.ship, this.enemyShots, this.hitBossShot as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
    this.physics.add.overlap(this.rocks, this.satelliteCollider, this.rockHitsSatellite as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
    this.scale.on('resize', (size: Phaser.Structs.Size) => {
      this.physics.world.setBounds(0, 0, size.width, size.height);
      this.layoutSpaceBackground(size.width, size.height);
      this.layoutSatelliteBackground(size.width, size.height);
      if (!this.started) this.ship.setPosition(size.width / 2, size.height / 2);
      this.satellite.setPosition(size.width / 2, size.height / 2);
      this.satelliteCollider.setPosition(size.width / 2, size.height / 2);
    });

    window.addEventListener('orbit:start', this.startGame);
    window.addEventListener('orbit:toggle-pause', this.togglePause);
    window.addEventListener('orbit:return-lobby', this.returnToLobby);
    window.addEventListener('orbit:touch', this.handleTouch);
    window.dispatchEvent(new CustomEvent('orbit:overlay', { detail: {
      visible: true,
      title: 'ESCOLHA SUA<br /><span>MISSÃO.</span>',
      copy: 'Escolha uma fase e prepare sua nave para decolar.',
      button: 'LANÇAR VETOR',
      showLevels: true,
      showShips: true,
    } }));
    this.emitStatus('AGUARDANDO PILOTO');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
  }

  update(time: number, delta: number) {
    if (!this.started) return;
    if (Phaser.Input.Keyboard.JustDown(this.keys.P)) this.togglePause();
    if (this.paused || !this.ship.active) return;
    const width = this.scale.width;
    const height = this.scale.height;
    const shipBody = this.ship.body as Phaser.Physics.Arcade.Body;
    if (this.levelId === 'satellite-defense' && time >= this.nextAlienSpawnAt && this.aliens.countActive(true) === 0) this.spawnAlien(time);
    const activeBoss = this.rocks.getChildren().find((item) => item.active && item.getData('boss')) as Phaser.Physics.Arcade.Sprite | undefined;
    if (activeBoss && time >= this.nextBossShotAt) this.shootBoss(activeBoss, time);
    this.shieldAura.setPosition(this.ship.x, this.ship.y);
    const abilityTouchDown = this.touch.has('ability');
    if (Phaser.Input.Keyboard.JustDown(this.keys.E) || (abilityTouchDown && !this.abilityTouchWasDown)) this.activateAbility(time);
    this.abilityTouchWasDown = abilityTouchDown;
    if (this.overdriveActive && time >= this.overdriveUntil) {
      this.overdriveActive = false;
      this.ship.setMaxVelocity(SHIP_LOADOUTS[this.shipId].maxSpeed);
    }
    if (!this.abilityReady) {
      if (time >= this.nextAbilityAt) {
        this.abilityReady = true;
        this.emitAbilityStatus(true, 0);
      } else {
        const remaining = Math.ceil((this.nextAbilityAt - time) / 1000);
        if (remaining !== this.lastAbilitySecondsRemaining) this.emitAbilityStatus(false, remaining);
      }
    }

    if (this.missionType === 'survive') {
      const remaining = Math.max(0, Math.ceil((this.missionUntil - time) / 1000));
      if (remaining !== this.missionSecondsRemaining) {
        this.missionSecondsRemaining = remaining;
        this.emitMission(`SOBREVIVA À CHUVA DE METEOROS · ${remaining}s`, 1 - remaining / 30);
      }
      if (remaining === 0) {
        this.rocks.clear(true, true);
        this.missionType = 'clear';
      }
    }

    this.stars.getChildren().forEach((child) => {
      const star = child as Phaser.GameObjects.Arc;
      const parallax = star.getData('parallax') as number;
      const baseAlpha = star.getData('baseAlpha') as number;
      const twinkle = star.getData('twinkleSpeed') as number;
      const phase = star.getData('phase') as number;
      star.setAlpha(baseAlpha * (0.72 + Math.sin(time * twinkle + phase) * 0.28));
      if (shipBody.speed > 20) {
        star.x -= Math.cos(this.ship.rotation) * shipBody.speed * delta * 0.00004 * parallax;
        star.y -= Math.sin(this.ship.rotation) * shipBody.speed * delta * 0.00004 * parallax;
        if (star.x < 0) star.x = width;
        if (star.x > width) star.x = 0;
        if (star.y < 0) star.y = height;
        if (star.y > height) star.y = 0;
      }
    });

    const left = this.cursors.left.isDown || this.keys.A.isDown || this.touch.has('left');
    const right = this.cursors.right.isDown || this.keys.D.isDown || this.touch.has('right');
    const thrust = this.cursors.up.isDown || this.keys.W.isDown || this.touch.has('thrust');
    const fire = this.cursors.space.isDown || this.keys.SPACE.isDown || this.touch.has('fire');
    const engineFlame = this.children.getByName('engine-flame') as Phaser.GameObjects.Graphics;
    engineFlame.clear();
    if (thrust) {
      const forwardX = Math.cos(this.ship.rotation);
      const forwardY = Math.sin(this.ship.rotation);
      const perpendicularX = -forwardY;
      const perpendicularY = forwardX;
      const baseX = this.ship.x - forwardX * 15;
      const baseY = this.ship.y - forwardY * 15;
      const flameLength = 12 + (Math.sin(time * 0.04) + 1) * 6;
      const flameColor = this.shipId === 'bastion' ? 0xff8b5f : 0xffa34a;
      engineFlame.fillStyle(flameColor, 0.9);
      engineFlame.fillPoints([
        new Phaser.Geom.Point(baseX + perpendicularX * 5, baseY + perpendicularY * 5),
        new Phaser.Geom.Point(baseX - forwardX * flameLength, baseY - forwardY * flameLength),
        new Phaser.Geom.Point(baseX - perpendicularX * 5, baseY - perpendicularY * 5),
      ], true);
      engineFlame.fillStyle(0xfff1c4, 0.85);
      engineFlame.fillPoints([
        new Phaser.Geom.Point(baseX + perpendicularX * 2, baseY + perpendicularY * 2),
        new Phaser.Geom.Point(baseX - forwardX * flameLength * 0.64, baseY - forwardY * flameLength * 0.64),
        new Phaser.Geom.Point(baseX - perpendicularX * 2, baseY - perpendicularY * 2),
      ], true);
    }
    const loadout = SHIP_LOADOUTS[this.shipId];
    const turnSpeed = loadout.turnSpeed * (this.overdriveActive ? 1.5 : 1);
    if (left) this.ship.rotation -= turnSpeed * delta / 1000;
    if (right) this.ship.rotation += turnSpeed * delta / 1000;
    const body = this.ship.body as Phaser.Physics.Arcade.Body;
    const acceleration = loadout.acceleration * (this.overdriveActive ? 1.8 : 1);
    body.setAcceleration(thrust ? Math.cos(this.ship.rotation) * acceleration : 0, thrust ? Math.sin(this.ship.rotation) * acceleration : 0);
    if (fire) this.shoot(time);

    this.wrap(this.ship, width, height);
    for (const item of this.rocks.getChildren()) {
      const rock = item as Phaser.Physics.Arcade.Sprite;
      if (!rock.active) continue;
      if (rock.getData('boss')) {
        const phase = time * 0.0007;
        (rock.body as Phaser.Physics.Arcade.Body).setVelocity(Math.cos(phase) * 44, 22 + Math.sin(phase) * 34);
        rock.rotation += delta * 0.00015;
      }
      this.wrap(rock, width, height);
    }
    for (const item of this.bullets.getChildren()) {
      const bullet = item as Phaser.Physics.Arcade.Sprite;
      if (!bullet.active) continue;
      if (time >= (bullet.getData('expiresAt') as number)) {
        bullet.disableBody(true, true);
        continue;
      }
      this.wrap(bullet, width, height);
    }
    for (const item of this.enemyShots.getChildren()) {
      const shot = item as Phaser.Physics.Arcade.Sprite;
      if (!shot.active) continue;
      if (time >= (shot.getData('expiresAt') as number) || shot.x < -24 || shot.x > width + 24 || shot.y < -24 || shot.y > height + 24) {
        shot.disableBody(true, true);
      }
    }
    for (const child of this.aliens.getChildren()) {
      const alien = child as Phaser.Physics.Arcade.Sprite;
      if (!alien.active) continue;
      const directionX = alien.getData('directionX') as number;
      const directionY = alien.getData('directionY') as number;
      const speed = alien.getData('speed') as number;
      const amplitude = alien.getData('curveAmplitude') as number;
      const phase = alien.getData('phase') as number;
      const curve = Math.sin(time * 0.0025 + phase) * amplitude;
      (alien.body as Phaser.Physics.Arcade.Body).setVelocity(
        directionX * speed - directionY * curve,
        directionY * speed + directionX * curve,
      );
      if (alien.x < -70 || alien.x > width + 70 || alien.y < -70 || alien.y > height + 70) alien.disableBody(true, true);
    }
    if (this.invulnerableUntil > time) this.ship.setAlpha(Math.floor(time / 90) % 2 ? 0.28 : 1);
    else this.ship.setAlpha(1);

    if (this.rocks.countActive(true) === 0 && this.missionType !== 'survive') {
      this.wave += 1;
      this.spawnWave();
      this.emitStatus(`ONDA ${String(this.wave).padStart(2, '0')} — ${this.missionType === 'boss' ? 'CHEFE DETECTADO' : 'METEOROS DETECTADOS'}`);
    }
  }

  private makeTextures() {
    const shipShapes: Record<ShipId, Phaser.Geom.Point[]> = {
      vector: [new Phaser.Geom.Point(41, 20), new Phaser.Geom.Point(9, 5), new Phaser.Geom.Point(14, 20), new Phaser.Geom.Point(9, 35)],
      bastion: [new Phaser.Geom.Point(39, 20), new Phaser.Geom.Point(27, 5), new Phaser.Geom.Point(11, 6), new Phaser.Geom.Point(6, 13), new Phaser.Geom.Point(3, 20), new Phaser.Geom.Point(6, 27), new Phaser.Geom.Point(11, 34), new Phaser.Geom.Point(27, 35)],
      phantom: [new Phaser.Geom.Point(42, 20), new Phaser.Geom.Point(12, 7), new Phaser.Geom.Point(19, 20), new Phaser.Geom.Point(12, 33), new Phaser.Geom.Point(27, 28), new Phaser.Geom.Point(31, 35), new Phaser.Geom.Point(28, 20), new Phaser.Geom.Point(31, 5)],
    };
    for (const shipId of SHIP_IDS) {
      if (shipId === 'bastion') {
        const texture = this.textures.createCanvas('ship-bastion', 64, 64)!;
        const context = texture.getContext();
        context.clearRect(0, 0, 64, 64);
        context.save();
        context.translate(32, 32);
        context.rotate(Math.PI / 2);
        context.scale(1, 0.72);
        context.translate(-32, -32);
        context.lineJoin = 'miter';
        context.lineCap = 'square';
        const polygon = (points: number[][], fill: string, edge = '#aab0a0') => {
          context.beginPath();
          context.moveTo(points[0][0], points[0][1]);
          for (const [x, y] of points.slice(1)) context.lineTo(x, y);
          context.closePath();
          context.fillStyle = fill;
          context.fill();
          context.lineWidth = 5;
          context.strokeStyle = '#171b19';
          context.stroke();
          context.lineWidth = 1.5;
          context.strokeStyle = edge;
          context.stroke();
        };
        const fillPolygon = (points: number[][], fill: string) => {
          context.beginPath();
          context.moveTo(points[0][0], points[0][1]);
          for (const [x, y] of points.slice(1)) context.lineTo(x, y);
          context.closePath();
          context.fillStyle = fill;
          context.fill();
        };
        const mirror = (points: number[][]) => points.map(([x, y]) => [64 - x, y]);

        polygon([[31, 18], [25, 17], [18, 6], [11, 4], [6, 8], [4, 16], [8, 30], [13, 41], [22, 51], [29, 54], [32, 46]], '#485436', '#8c9873');
        polygon(mirror([[31, 18], [25, 17], [18, 6], [11, 4], [6, 8], [4, 16], [8, 30], [13, 41], [22, 51], [29, 54], [32, 46]]), '#485436', '#8c9873');
        fillPolygon([[30, 22], [24, 19], [18, 10], [12, 8], [9, 12], [12, 26], [17, 38], [23, 46], [30, 47]], '#788a48');
        fillPolygon(mirror([[30, 22], [24, 19], [18, 10], [12, 8], [9, 12], [12, 26], [17, 38], [23, 46], [30, 47]]), '#788a48');
        fillPolygon([[8, 14], [12, 12], [17, 25], [13, 34], [10, 28]], '#353c31');
        fillPolygon(mirror([[8, 14], [12, 12], [17, 25], [13, 34], [10, 28]]), '#353c31');
        fillPolygon([[14, 15], [18, 12], [23, 21], [22, 39], [18, 35]], '#9aa35e');
        fillPolygon(mirror([[14, 15], [18, 12], [23, 21], [22, 39], [18, 35]]), '#9aa35e');

        polygon([[28, 20], [24, 24], [23, 36], [27, 47], [32, 57], [37, 47], [41, 36], [40, 24], [36, 20]], '#343a3a', '#9ca198');
        polygon([[25, 24], [20, 21], [16, 24], [21, 28]], '#68704f', '#202421');
        polygon([[39, 24], [44, 21], [48, 24], [43, 28]], '#68704f', '#202421');
        polygon([[27, 23], [29, 20], [35, 20], [37, 23], [38, 29], [35, 33], [29, 33], [26, 29]], '#202524', '#858b80');
        fillPolygon([[29, 24], [31, 22], [34, 22], [36, 25], [35, 29], [32, 31], [29, 29]], '#4d5550');
        polygon([[27, 17], [29, 13], [31, 17], [31, 22], [27, 22]], '#49504c', '#9ca198');
        polygon([[37, 17], [35, 13], [33, 17], [33, 22], [37, 22]], '#49504c', '#9ca198');
        fillPolygon([[30, 34], [34, 34], [35, 43], [32, 49], [29, 43]], '#596057');

        for (const [x, y] of [[9, 18], [12, 23], [17, 17], [19, 30], [14, 37], [22, 43], [54, 18], [51, 23], [47, 17], [45, 30], [50, 37], [42, 43]]) {
          context.fillStyle = '#c2c6a6';
          context.fillRect(x, y, 1.5, 1.5);
          context.fillStyle = '#222820';
          context.fillRect(x + 2, y + 2, 1, 1);
        }
        context.restore();
        texture.refresh();
        continue;
      }
      if (shipId === 'vector') {
        const texture = this.textures.createCanvas('ship-vector', 48, 48)!;
        const context = texture.getContext();
        context.clearRect(0, 0, 48, 48);
        context.save();
        context.scale(0.75, 0.75);
        context.translate(32, 32);
        context.rotate(Math.PI / 2);
        context.translate(-32, -32);
        context.lineJoin = 'miter';
        context.lineCap = 'square';
        const polygon = (points: number[][], fill: string) => {
          context.beginPath();
          context.moveTo(points[0][0], points[0][1]);
          for (const [x, y] of points.slice(1)) context.lineTo(x, y);
          context.closePath();
          context.fillStyle = fill;
          context.fill();
          context.lineWidth = 5;
          context.strokeStyle = '#101318';
          context.stroke();
          context.lineWidth = 2;
          context.strokeStyle = '#f0f4ec';
          context.stroke();
        };
        const solidPolygon = (points: number[][], fill: string) => {
          context.beginPath();
          context.moveTo(points[0][0], points[0][1]);
          for (const [x, y] of points.slice(1)) context.lineTo(x, y);
          context.closePath();
          context.fillStyle = fill;
          context.fill();
        };

        polygon([[27, 46], [37, 46], [36, 54], [33, 61], [30, 54]], '#f04431');
        solidPolygon([[30, 47], [34, 47], [33, 55], [32, 58], [31, 55]], '#ffd44f');
        polygon([[13, 23], [19, 23], [19, 42], [13, 42]], '#db383d');
        polygon([[45, 23], [51, 23], [51, 42], [45, 42]], '#db383d');
        solidPolygon([[14, 21], [18, 21], [17, 25], [15, 25]], '#ffb83f');
        solidPolygon([[46, 21], [50, 21], [49, 25], [47, 25]], '#ffb83f');
        solidPolygon([[14, 31], [18, 31], [18, 34], [14, 34]], '#83d8e9');
        solidPolygon([[46, 31], [50, 31], [50, 34], [46, 34]], '#83d8e9');
        solidPolygon([[14, 37], [18, 37], [18, 40], [14, 40]], '#273d55');
        solidPolygon([[46, 37], [50, 37], [50, 40], [46, 40]], '#273d55');

        polygon([[28, 23], [22, 27], [17, 34], [4, 41], [5, 45], [20, 47], [29, 41]], '#e94249');
        polygon([[36, 23], [42, 27], [47, 34], [60, 41], [59, 45], [44, 47], [35, 41]], '#e94249');
        solidPolygon([[7, 43], [21, 44], [28, 40], [28, 44], [22, 47], [8, 46]], '#962e41');
        solidPolygon([[57, 43], [43, 44], [36, 40], [36, 44], [42, 47], [56, 46]], '#962e41');
        solidPolygon([[5, 44], [20, 45], [27, 43], [27, 46], [20, 48], [7, 47]], '#52c7e2');
        solidPolygon([[59, 44], [44, 45], [37, 43], [37, 46], [44, 48], [57, 47]], '#52c7e2');

        polygon([[24, 40], [29, 44], [27, 54], [23, 53], [21, 47]], '#53606b');
        polygon([[40, 40], [35, 44], [37, 54], [41, 53], [43, 47]], '#53606b');
        polygon([[32, 3], [37, 9], [40, 20], [40, 47], [24, 47], [24, 20], [27, 9]], '#e8eff0');
        solidPolygon([[25, 21], [29, 24], [29, 45], [25, 45]], '#64c9e3');
        solidPolygon([[39, 21], [35, 24], [35, 45], [39, 45]], '#69cce4');
        solidPolygon([[27, 30], [36, 20], [38, 23], [28, 34]], '#b5eaf0');
        solidPolygon([[27, 39], [36, 30], [38, 33], [28, 43]], '#b5eaf0');
        polygon([[27, 19], [29, 12], [35, 12], [37, 19], [37, 23], [27, 23]], '#178ab8');
        solidPolygon([[29, 18], [30, 14], [34, 14], [35, 18]], '#45c7e8');
        context.fillStyle = '#17232b';
        context.fillRect(30, 25, 2, 21);
        context.fillRect(34, 25, 2, 21);
        context.fillRect(25, 42, 14, 2);
        context.fillStyle = '#fff5e6';
        context.fillRect(10, 38, 2, 2);
        context.fillRect(12, 36, 2, 2);
        context.fillRect(52, 38, 2, 2);
        context.fillRect(50, 36, 2, 2);
        context.restore();
        texture.refresh();
        continue;
      }
      if (shipId === 'phantom') {
        const texture = this.textures.createCanvas('ship-phantom', 48, 48)!;
        const context = texture.getContext();
        context.clearRect(0, 0, 48, 48);
        context.save();
        context.scale(0.75, 0.75);
        context.translate(32, 32);
        context.rotate(Math.PI / 2);
        context.translate(-32, -32);
        context.imageSmoothingEnabled = false;
        const polygon = (points: number[][], fill: string, outline = '#171b1d') => {
          context.beginPath();
          context.moveTo(points[0][0], points[0][1]);
          for (const [x, y] of points.slice(1)) context.lineTo(x, y);
          context.closePath();
          context.fillStyle = fill;
          context.fill();
          context.lineWidth = 3;
          context.strokeStyle = outline;
          context.stroke();
        };
        const block = (x: number, y: number, width: number, height: number, color: string) => {
          context.fillStyle = color;
          context.fillRect(x, y, width, height);
        };
        const leftWing = [[29, 20], [24, 17], [15, 8], [11, 8], [8, 13], [9, 23], [14, 31], [21, 34], [28, 30]];
        const mirroredWing = (points: number[][]) => points.map(([x, y]) => [64 - x, y]);

        polygon([[29, 42], [35, 42], [35, 49], [33, 55], [30, 50]], '#ef6a32');
        block(30, 44, 4, 5, '#ffb83f');
        polygon(leftWing, '#62696b', '#161a1c');
        polygon(mirroredWing(leftWing), '#62696b', '#161a1c');
        polygon([[26, 20], [22, 19], [15, 12], [12, 13], [12, 22], [16, 29], [22, 31], [27, 28]], '#b7b9b0', '#3e4445');
        polygon(mirroredWing([[26, 20], [22, 19], [15, 12], [12, 13], [12, 22], [16, 29], [22, 31], [27, 28]]), '#b7b9b0', '#3e4445');
        polygon([[27, 10], [29, 7], [35, 7], [37, 10], [39, 17], [39, 38], [35, 45], [29, 45], [25, 38], [25, 17]], '#d5d6ce', '#181c1d');
        block(29, 13, 6, 25, '#799b65');
        block(30, 16, 4, 18, '#a9c590');
        block(28, 21, 8, 3, '#596d56');
        block(28, 29, 8, 3, '#596d56');
        block(30, 9, 4, 3, '#303b40');
        block(31, 8, 2, 2, '#8bbde0');
        block(28, 36, 8, 2, '#535c5b');
        polygon([[20, 17], [23, 16], [24, 22], [20, 24]], '#555c5f');
        polygon([[44, 17], [41, 16], [40, 22], [44, 24]], '#555c5f');
        block(10, 18, 2, 8, '#555d5f');
        block(52, 18, 2, 8, '#555d5f');
        context.restore();
        texture.refresh();
        continue;
      }
      const ship = this.make.graphics({ x: 0, y: 0 });
      const color = 0x75ddd0;
      ship.fillStyle(color, 1);
      ship.lineStyle(2, 0xe7ffc8, 1);
      ship.fillPoints(shipShapes[shipId], true);
      ship.strokePoints(shipShapes[shipId], true);
      ship.lineStyle(1, 0xefffe3, 0.7);
      ship.lineBetween(14, 20, 28, 20);
      ship.generateTexture(`ship-${shipId}`, 48, 40);
      ship.destroy();
    }

    const bulletColors: Record<ShipId, { glow: number; core: number; highlight: number }> = {
      vector: { glow: 0xff303b, core: 0xff4752, highlight: 0xffd0ca },
      bastion: { glow: 0x32e85a, core: 0x67ff79, highlight: 0xd8ffe0 },
      phantom: { glow: 0x248bff, core: 0x55b4ff, highlight: 0xd8f1ff },
    };
    for (const shipId of SHIP_IDS) {
      const bullet = this.make.graphics({ x: 0, y: 0 });
      const colors = bulletColors[shipId];
      bullet.fillStyle(colors.glow, 0.42).fillEllipse(8, 6, 15, 9);
      bullet.fillStyle(colors.core, 1).fillEllipse(8, 6, 12, 5.4);
      bullet.fillStyle(colors.highlight, 1).fillEllipse(8, 6, 7, 2.4);
      bullet.generateTexture(`bullet-${shipId}`, 16, 12);
      bullet.destroy();
    }

    for (let index = 0; index < 4; index += 1) {
      const graphics = this.make.graphics({ x: 0, y: 0 });
      const points: Phaser.Geom.Point[] = [];
      const count = 10 + index % 3;
      for (let point = 0; point < count; point += 1) {
        const angle = (point / count) * Math.PI * 2;
        const radius = 23 + Phaser.Math.Between(-5, 5);
        points.push(new Phaser.Geom.Point(32 + Math.cos(angle) * radius, 32 + Math.sin(angle) * radius));
      }
      graphics.fillStyle(index % 2 ? 0x747d73 : 0x888f80, 1);
      graphics.lineStyle(2, 0xb0b99f, 0.9);
      graphics.fillPoints(points, true);
      graphics.strokePoints(points, true);
      graphics.fillStyle(0x465148, 0.88);
      graphics.fillCircle(22, 23, 5 + index % 3);
      graphics.fillCircle(42, 39, 4 + index % 2);
      graphics.fillCircle(43, 17, 3 + index % 2);
      graphics.lineStyle(1.5, 0xb3b79e, 0.52);
      graphics.strokeCircle(22, 22, 5 + index % 3);
      graphics.strokeCircle(42, 38, 4 + index % 2);
      graphics.lineStyle(1, 0x4b574e, 0.75);
      graphics.lineBetween(14, 37, 20, 43);
      graphics.lineBetween(38, 27, 47, 24);
      graphics.generateTexture(`rock-${index}`, 64, 64);
      graphics.destroy();
    }

    const satelliteHitbox = this.make.graphics({ x: 0, y: 0 });
    satelliteHitbox.fillStyle(0xffffff, 1).fillRect(0, 0, 64, 64);
    satelliteHitbox.generateTexture('satellite-hitbox', 64, 64);
    satelliteHitbox.destroy();

    const ufo = this.make.graphics({ x: 0, y: 0 });
    const ufoPolygon = (coordinates: number[][], fillColor: number) => {
      const points = coordinates.map(([x, y]) => new Phaser.Geom.Point(x, y));
      ufo.fillStyle(fillColor, 1);
      ufo.fillPoints(points, true);
      ufo.lineStyle(4, 0x181726, 1);
      ufo.strokePoints(points, true);
      ufo.lineStyle(1, 0xd4c7b1, 0.8);
      ufo.strokePoints(points, true);
    };
    ufo.fillStyle(0x171722, 1).fillRect(45, 5, 8, 20);
    ufo.fillStyle(0xc2c6cf, 1).fillRect(47, 7, 4, 16);
    ufo.fillStyle(0x73758b, 1).fillRect(47, 13, 4, 4);
    ufo.fillStyle(0xd94e5a, 1).fillRect(40, 1, 18, 8);
    ufo.lineStyle(2, 0xf0e7d1, 1).strokeRect(40, 1, 18, 8);
    ufoPolygon([[27, 32], [30, 21], [37, 14], [45, 11], [53, 11], [62, 15], [68, 23], [71, 32]], 0xa7d9d5);
    ufo.fillStyle(0xd2eeee, 0.95).fillRect(36, 22, 24, 2);
    ufo.fillStyle(0xc9e8e4, 1).fillRect(33, 25, 30, 5);
    ufoPolygon([[19, 30], [27, 28], [69, 28], [78, 30], [91, 33], [95, 39], [90, 44], [77, 47], [19, 47], [6, 44], [1, 39], [5, 33]], 0x77709e);
    ufo.fillStyle(0xa69dc1, 1).fillRect(12, 35, 72, 4);
    ufo.fillStyle(0x514b78, 1).fillRect(9, 40, 78, 4);
    ufo.fillStyle(0xf1c356, 1).fillRect(7, 44, 82, 4);
    ufo.fillStyle(0x241c35, 1).fillRect(17, 48, 62, 3);
    ufoPolygon([[19, 49], [77, 49], [70, 57], [61, 62], [34, 62], [25, 57]], 0xd36e75);
    ufo.fillStyle(0xf2bf56, 1).fillRect(28, 52, 40, 4);
    ufo.fillStyle(0x302744, 1).fillRect(34, 56, 28, 4);
    for (const x of [17, 34, 48, 62, 79]) {
      ufo.fillStyle(0x29243a, 1).fillCircle(x, 38, 4);
      ufo.fillStyle(0xc6c3d7, 1).fillCircle(x - 1, 37, 2);
    }
    for (const x of [23, 48, 73]) {
      ufo.fillStyle(0xf4c75c, 1).fillRect(x, 60, 5, 7);
      ufo.fillStyle(0xf07848, 1).fillRect(x + 1, 64, 3, 5);
    }
    ufo.generateTexture('alien-ufo', 96, 72);
    ufo.destroy();

    this.createPlanetTexture('planet-ember', ['#1c1c35', '#573047', '#a34448', '#e97843', '#ffc467', '#ffe5a0']);
    this.createPlanetTexture('planet-tide', ['#17203a', '#25495c', '#367c82', '#59a99a', '#a2c891', '#d9e1a2']);
  }

  private createPlanetTexture(key: string, palette: [string, string, string, string, string, string]) {
    const texture = this.textures.createCanvas(key, 64, 64)!;
    const context = texture.getContext();
    context.clearRect(0, 0, 64, 64);
    const center = 32;
    const radius = 25;
    const pixelSize = 2;

    for (let y = 4; y < 60; y += pixelSize) {
      for (let x = 4; x < 60; x += pixelSize) {
        const dx = (x + 1 - center) / radius;
        const dy = (y + 1 - center) / radius;
        const distance = dx * dx + dy * dy;
        if (distance > 1) continue;
        const light = -dx * 0.62 - dy * 0.78;
        let shade = light > 0.55 ? 5 : light > 0.17 ? 4 : light > -0.24 ? 3 : light > -0.68 ? 2 : 1;
        if (distance > 0.84) shade = Math.min(shade, 1);
        const terrain = (x * 7 + y * 13 + Math.floor(x * y / 11)) % 29;
        if (light > 0.08 && terrain < 5) shade = Math.min(5, shade + 1);
        if (light > -0.18 && terrain > 24) shade = Math.max(1, shade - 1);
        context.fillStyle = palette[shade];
        context.fillRect(x, y, pixelSize, pixelSize);
      }
    }
    context.fillStyle = palette[5];
    context.fillRect(18, 14, 6, 2);
    context.fillRect(14, 18, 4, 2);
    context.fillStyle = palette[4];
    context.fillRect(12, 22, 4, 4);
    context.fillRect(20, 12, 6, 2);
    context.fillStyle = palette[0];
    context.fillRect(43, 42, 4, 4);
    context.fillRect(39, 46, 4, 2);
    texture.refresh();
  }

  private createStars() {
    this.spaceBackdrop = this.add.graphics().setDepth(-10);
    this.nebulaLayer = this.add.graphics().setDepth(-9);
    this.planets = [
      this.add.image(0, 0, 'planet-ember').setDepth(-7),
      this.add.image(0, 0, 'planet-ember').setDepth(-7),
      this.add.image(0, 0, 'planet-tide').setDepth(-7),
    ];
    this.layoutSpaceBackground(this.scale.width, this.scale.height);

    this.stars = this.add.group();
    for (let index = 0; index < 220; index += 1) {
      const size = index % 13 === 0 ? 3 : index % 4 === 0 ? 2 : 1.4;
      const alpha = Math.random() * 0.4 + (index % 13 === 0 ? 0.48 : 0.2);
      const color = index % 17 === 0 ? 0xffdf9b : index % 5 === 0 ? 0xb1caff : 0xdde6ff;
      const star = this.add.rectangle(Math.random() * this.scale.width, Math.random() * this.scale.height, size, size, color, alpha).setDepth(-5);
      star.setData('baseAlpha', alpha);
      star.setData('twinkleSpeed', Phaser.Math.FloatBetween(0.001, 0.003));
      star.setData('phase', Phaser.Math.FloatBetween(0, Math.PI * 2));
      star.setData('parallax', Phaser.Math.FloatBetween(0.12, 0.55));
      this.stars.add(star);
    }
  }

  private layoutSpaceBackground(width: number, height: number) {
    this.spaceBackdrop.clear();
    this.spaceBackdrop.fillStyle(0x070c1d, 1).fillRect(0, 0, width, height);
    this.nebulaLayer.clear();
    this.nebulaLayer.fillStyle(0x14234a, 0.075).fillEllipse(width * 0.48, height * 0.5, width * 1.3, height * 0.34);
    this.nebulaLayer.fillStyle(0x1c3153, 0.035).fillEllipse(width * 0.56, height * 0.56, width * 0.96, height * 0.18);

    const unit = Math.min(width, height);
    const placements = [
      { x: 0.14, y: 0.14, size: 0.17 },
      { x: 0.28, y: 0.34, size: 0.095 },
      { x: 0.82, y: 0.72, size: 0.255 },
    ];
    for (const [index, placement] of placements.entries()) {
      this.planets[index].setPosition(width * placement.x, height * placement.y).setDisplaySize(unit * placement.size, unit * placement.size);
    }
  }

  private layoutSatelliteBackground(width: number, height: number) {
    if (!this.satelliteBackdrop) return;
    const scale = Math.max(width / 1600, height / 900);
    this.satelliteBackdrop.setPosition(width / 2, height / 2).setScale(scale);
  }

  private updateBackgroundForLevel() {
    const useSatelliteBackground = this.levelId === 'satellite-defense';
    this.spaceBackdrop.setVisible(!useSatelliteBackground);
    this.nebulaLayer.setVisible(!useSatelliteBackground);
    for (const planet of this.planets) planet.setVisible(!useSatelliteBackground);
    this.satelliteBackdrop.setVisible(useSatelliteBackground);
  }

  private startGame = (event: Event) => {
    if (this.paused) {
      this.togglePause();
      return;
    }
    this.score = 0;
    this.runStartedAt = this.time.now;
    const startOptions = (event as CustomEvent<{ level?: GameLevelId; ship?: ShipId; skin?: string }>).detail;
    if (startOptions?.level === 'satellite-defense' || startOptions?.level === 'boss-rush' || startOptions?.level === 'asteroid-classic') this.levelId = startOptions.level;
    this.updateBackgroundForLevel();
    const requestedShip = startOptions?.ship;
    if (requestedShip && SHIP_IDS.includes(requestedShip)) this.shipId = requestedShip;
    this.lives = 3;
    this.wave = 1;
    this.started = true;
    this.paused = false;
    this.invulnerableUntil = this.time.now + 1600;
    this.nextAbilityAt = 0;
    this.abilityReady = true;
    this.overdriveActive = false;
    this.shieldUntil = 0;
    this.lastShotAt = 0;
    this.lastAbilitySecondsRemaining = -1;
    this.missionType = 'clear';
    this.missionUntil = 0;
    this.missionSecondsRemaining = -1;
    this.satelliteHealth = 100;
    this.satelliteInvulnerableUntil = 0;
    this.shieldAura.setVisible(false);
    this.abilityTouchWasDown = false;
    this.rocks.clear(true, true);
    this.bullets.clear(true, true);
    this.enemyShots.clear(true, true);
    this.aliens.clear(true, true);
    this.nextAlienSpawnAt = this.time.now + Phaser.Math.Between(6000, 9000);
    const hull = this.shipId === 'bastion'
      ? { width: 56, height: 54, radius: 14, offsetX: 18, offsetY: 18 }
      : this.shipId === 'vector'
        ? { width: 48, height: 48, radius: 12, offsetX: 12, offsetY: 12 }
        : { width: 48, height: 48, radius: 12, offsetX: 12, offsetY: 12 };
    this.ship.setTexture(`ship-${this.shipId}`)
      .setMaxVelocity(SHIP_LOADOUTS[this.shipId].maxSpeed)
      .setDisplaySize(hull.width, hull.height);
    const skinTints: Record<string, number> = { standard: 0xffffff, solar: 0xffcb70, plasma: 0x78d8ff };
    this.ship.setTint(skinTints[startOptions?.skin ?? 'standard'] ?? skinTints.standard);
    const shipStartX = this.scale.width / 2 + (this.levelId === 'satellite-defense' ? Math.min(96, this.scale.width * 0.22) : 0);
    const shipStartY = this.scale.height / 2 + (this.levelId === 'satellite-defense' ? Math.min(64, this.scale.height * 0.18) : 0);
    this.ship.enableBody(true, shipStartX, shipStartY, true, true);
    (this.ship.body as Phaser.Physics.Arcade.Body).setCircle(hull.radius, hull.offsetX, hull.offsetY);
    this.satellite.setPosition(this.scale.width / 2, this.scale.height / 2)
      .setActive(this.levelId === 'satellite-defense')
      .setVisible(this.levelId === 'satellite-defense');
    this.satelliteCollider.setPosition(this.scale.width / 2, this.scale.height / 2)
      .setActive(this.levelId === 'satellite-defense');
    (this.satelliteCollider.body as Phaser.Physics.Arcade.Body).enable = this.levelId === 'satellite-defense';
    this.emitSatelliteStatus();
    this.ship.setRotation(-Math.PI / 2).setVelocity(0, 0).setAcceleration(0, 0).setAlpha(1);
    this.spawnWave();
    window.dispatchEvent(new CustomEvent('orbit:overlay', { detail: { visible: false, title: '', copy: '', button: '' } }));
    window.dispatchEvent(new CustomEvent('orbit:pause-state', { detail: false }));
    this.emitAbilityStatus(true, 0);
    this.emitStatus('NAVE EM OPERAÇÃO');
  };

  private togglePause = () => {
    if (!this.started) return;
    this.paused = !this.paused;
    window.dispatchEvent(new CustomEvent('orbit:pause-state', { detail: this.paused }));
    if (this.paused) {
      window.dispatchEvent(new CustomEvent('orbit:overlay', { detail: {
        visible: true,
        title: 'PAUSA<br /><span>ORBITAL.</span>',
        copy: 'Sua nave está segura por enquanto.<br />Respire. Depois, volte à missão.',
        button: 'RETOMAR MISSÃO',
        showLevels: false,
        showShips: false,
        showLobbyButton: true,
      } }));
      this.emitStatus('MISSÃO EM PAUSA');
    } else {
      window.dispatchEvent(new CustomEvent('orbit:overlay', { detail: { visible: false, title: '', copy: '', button: '' } }));
      this.emitStatus('NAVE EM OPERAÇÃO');
    }
  };

  private returnToLobby = () => {
    if (!this.started || !this.paused) return;
    this.started = false;
    this.paused = false;
    this.score = 0;
    this.lives = 3;
    this.wave = 1;
    this.missionType = 'clear';
    this.ship.disableBody(true, true);
    this.rocks.clear(true, true);
    this.bullets.clear(true, true);
    this.enemyShots.clear(true, true);
    this.aliens.clear(true, true);
    this.satellite.setVisible(false).setActive(false);
    this.satelliteCollider.setVisible(false).setActive(false);
    (this.satelliteCollider.body as Phaser.Physics.Arcade.Body).enable = false;
    this.touch.clear();
    this.abilityTouchWasDown = false;
    this.shieldUntil = 0;
    this.shieldAura.setVisible(false);
    (this.children.getByName('engine-flame') as Phaser.GameObjects.Graphics).clear();
    window.dispatchEvent(new CustomEvent('orbit:pause-state', { detail: false }));
    window.dispatchEvent(new CustomEvent('orbit:overlay', { detail: {
      visible: true,
      title: 'ESCOLHA SUA<br /><span>MISSÃO.</span>',
      copy: 'Escolha uma fase e prepare sua nave para decolar.',
      button: `LANÇAR ${SHIP_LOADOUTS[this.shipId].name.toUpperCase()}`,
      showLevels: true,
      showShips: true,
      showLobbyButton: false,
    } }));
    this.emitStatus('AGUARDANDO PILOTO');
  };

  private handleTouch = (event: Event) => {
    const detail = (event as CustomEvent<{ control: TouchControl; active: boolean }>).detail;
    if (detail.active) this.touch.add(detail.control);
    else this.touch.delete(detail.control);
  };

  private spawnWave() {
    if (this.levelId === 'boss-rush' || (this.levelId === 'satellite-defense' && this.wave % 5 === 0)) {
      this.spawnBoss();
      return;
    }
    if (this.levelId === 'satellite-defense' && this.wave % 3 === 0) {
      this.missionType = 'survive';
      this.missionUntil = this.time.now + 30000;
      this.missionSecondsRemaining = -1;
      this.emitStatus('CHUVA DE METEOROS · 30s');
    } else {
      this.missionType = 'clear';
      this.emitMission(this.levelId === 'satellite-defense' ? 'PROTEJA O SATÉLITE' : 'DESTRUA TODOS OS ASTEROIDES', this.levelId === 'satellite-defense' ? this.satelliteHealth / 100 : 0);
    }
    this.emitSatelliteStatus();
    const count = Math.min(4 + this.wave, 10);
    for (let index = 0; index < count; index += 1) {
      if (this.levelId === 'satellite-defense') {
        const edge = Phaser.Math.Between(0, 3);
        const x = edge === 0 ? 0 : edge === 1 ? this.scale.width : Phaser.Math.Between(24, this.scale.width - 24);
        const y = edge === 2 ? 0 : edge === 3 ? this.scale.height : Phaser.Math.Between(24, this.scale.height - 24);
        const angle = Phaser.Math.Angle.Between(x, y, this.satellite.x, this.satellite.y);
        const speed = (Phaser.Math.Between(36, 78) + this.wave * 4) * (1 + Math.min((this.wave - 1) * 0.035, 0.7));
        this.addRock(x, y, 3, new Phaser.Math.Vector2(Math.cos(angle) * speed, Math.sin(angle) * speed));
        continue;
      }
      let x = 0;
      let y = 0;
      let attempts = 0;
      do {
        x = Phaser.Math.Between(24, Math.max(25, this.scale.width - 24));
        y = Phaser.Math.Between(24, Math.max(25, this.scale.height - 24));
        attempts += 1;
      } while (
        attempts < 80 &&
        (Phaser.Math.Distance.Between(x, y, this.ship.x, this.ship.y) < 120 ||
          this.planets.some((planet) => Phaser.Math.Distance.Between(x, y, planet.x, planet.y) < planet.displayWidth * 0.5 + 65))
      );
      this.addRock(x, y, 3);
    }
  }

  private spawnBoss() {
    this.missionType = 'boss';
    const boss = this.rocks.create(this.scale.width / 2, Math.max(70, this.scale.height * 0.24), 'rock-0') as Phaser.Physics.Arcade.Sprite;
    const health = 8 + (this.levelId === 'boss-rush' ? this.wave : Math.floor(this.wave / 5)) * 2;
    boss.setScale(2.25).setDepth(2).setData('tier', 4).setData('boss', true).setData('health', health).setData('maxHealth', health);
    const body = boss.body as Phaser.Physics.Arcade.Body;
    body.setCircle(52, 8, 8).setVelocity(Phaser.Math.Between(-48, 48), Phaser.Math.Between(28, 62));
    this.nextBossShotAt = this.time.now + 900;
    this.emitMission(`CHEFE · ${health} ACERTOS`, 1);
    window.dispatchEvent(new CustomEvent('orbit:boss-status', { detail: { visible: true, health, maxHealth: health } }));
  }

  private shootBoss(boss: Phaser.Physics.Arcade.Sprite, time: number) {
    const shot = this.enemyShots.get(boss.x, boss.y, 'bullet-vector') as Phaser.Physics.Arcade.Sprite | null;
    if (!shot) return;
    const angle = Phaser.Math.Angle.Between(boss.x, boss.y, this.ship.x, this.ship.y);
    shot.enableBody(true, boss.x, boss.y, true, true).setTint(0xff665d).setDisplaySize(15, 15).setDepth(3);
    shot.setData('expiresAt', time + 4000);
    (shot.body as Phaser.Physics.Arcade.Body).setCircle(5, 4, 4).setVelocity(Math.cos(angle) * 165, Math.sin(angle) * 165);
    this.nextBossShotAt = time + Math.max(720, 1500 - this.wave * 18);
  }

  private spawnAlien(time: number) {
    const width = this.scale.width;
    const height = this.scale.height;
    const edgePoint = (edge: number) => {
      if (edge === 0) return { x: -56, y: Phaser.Math.Between(64, Math.max(65, height - 64)) };
      if (edge === 1) return { x: width + 56, y: Phaser.Math.Between(64, Math.max(65, height - 64)) };
      if (edge === 2) return { x: Phaser.Math.Between(64, Math.max(65, width - 64)), y: -56 };
      return { x: Phaser.Math.Between(64, Math.max(65, width - 64)), y: height + 56 };
    };
    const entryEdge = Phaser.Math.Between(0, 3);
    let exitEdge = Phaser.Math.Between(0, 2);
    if (exitEdge >= entryEdge) exitEdge += 1;
    const start = edgePoint(entryEdge);
    const destination = edgePoint(exitEdge);
    const vectorX = destination.x - start.x;
    const vectorY = destination.y - start.y;
    const distance = Math.hypot(vectorX, vectorY);
    const directionX = vectorX / distance;
    const directionY = vectorY / distance;
    const speed = Phaser.Math.Between(72, 96);
    const alien = this.aliens.get(start.x, start.y) as Phaser.Physics.Arcade.Sprite | null;
    if (!alien) return;
    alien.enableBody(true, start.x, start.y, true, true);
    alien.setTexture('alien-ufo').setDisplaySize(88, 66).setDepth(2.5).setRotation(0);
    alien.setData('directionX', directionX)
      .setData('directionY', directionY)
      .setData('speed', speed)
      .setData('curveAmplitude', Phaser.Math.Between(12, 30))
      .setData('phase', Phaser.Math.FloatBetween(0, Math.PI * 2));
    const body = alien.body as Phaser.Physics.Arcade.Body;
    body.setSize(82, 42).setOffset(7, 22).setVelocity(directionX * speed, directionY * speed);
    this.nextAlienSpawnAt = time + Phaser.Math.Between(22000, 34000);
    this.emitStatus('NAVE ALIENÍGENA NO RADAR');
  }

  private addRock(x: number, y: number, tier: number, velocity?: Phaser.Math.Vector2) {
    const rock = this.rocks.create(x, y, `rock-${Phaser.Math.Between(0, 3)}`) as Phaser.Physics.Arcade.Sprite;
    rock.setScale(tier === 3 ? 1 : tier === 2 ? 0.68 : 0.42).setDepth(2).setData('tier', tier);
    rock.setRotation(Phaser.Math.FloatBetween(0, Math.PI * 2));
    const body = rock.body as Phaser.Physics.Arcade.Body;
    body.setCircle(tier === 3 ? 23 : tier === 2 ? 16 : 10, 9, 9);
    const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const speed = (Phaser.Math.Between(28, 74) + this.wave * 3) * (1 + Math.min((this.wave - 1) * 0.035, 0.7));
    body.setVelocity(velocity?.x ?? Math.cos(angle) * speed, velocity?.y ?? Math.sin(angle) * speed);
  }

  private shoot(time: number) {
    const loadout = SHIP_LOADOUTS[this.shipId];
    const cooldown = this.overdriveActive ? 90 : loadout.shotDelay;
    if (time - this.lastShotAt < cooldown) return;
    this.lastShotAt = time;
    window.dispatchEvent(new CustomEvent('orbit:sound', { detail: { sound: 'shot' } }));
    const spread = this.shipId === 'phantom' ? [-0.035, 0.035] : [0];
    for (const angleOffset of spread) {
      const angle = this.ship.rotation + angleOffset;
      const bullet = this.bullets.get(this.ship.x + Math.cos(angle) * 22, this.ship.y + Math.sin(angle) * 22, `bullet-${this.shipId}`) as Phaser.Physics.Arcade.Sprite | null;
      if (!bullet) continue;
      bullet.enableBody(true, this.ship.x + Math.cos(angle) * 22, this.ship.y + Math.sin(angle) * 22, true, true);
      bullet.setDepth(4).setDisplaySize(16, 9).setRotation(angle);
      bullet.setData('expiresAt', time + 1050);
      const body = bullet.body as Phaser.Physics.Arcade.Body;
      body.setSize(11, 4).setOffset(2.5, 4);
      body.setVelocity(Math.cos(angle) * 470 + (this.ship.body as Phaser.Physics.Arcade.Body).velocity.x, Math.sin(angle) * 470 + (this.ship.body as Phaser.Physics.Arcade.Body).velocity.y);
      const muzzleX = this.ship.x + Math.cos(angle) * 25;
      const muzzleY = this.ship.y + Math.sin(angle) * 25;
      const muzzleColor = this.shipId === 'vector' ? 0xff4752 : this.shipId === 'bastion' ? 0x67ff79 : 0x55b4ff;
      const muzzleFlash = this.add.circle(muzzleX, muzzleY, 6, muzzleColor, 0.95)
        .setStrokeStyle(1.5, 0xfff0d3, 1)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(5)
        .setScale(0.35);
      this.tweens.add({
        targets: muzzleFlash,
        scale: 2.5,
        alpha: 0,
        duration: 155,
        ease: 'Cubic.easeOut',
        onComplete: () => muzzleFlash.destroy(),
      });
    }
  }

  private activateAbility(time: number) {
    if (!this.abilityReady || !this.started || this.paused) return;
    this.abilityReady = false;
    const loadout = SHIP_LOADOUTS[this.shipId];
    if (this.shipId === 'vector') {
      this.overdriveActive = true;
      this.overdriveUntil = time + 5000;
      this.nextAbilityAt = time + 9000;
      this.ship.setMaxVelocity(loadout.maxSpeed * 1.7);
      this.playAbilityBurst(this.ship.x, this.ship.y, 0xffa34a);
      this.flashShip(0xffd69a);
    } else if (this.shipId === 'bastion') {
      this.shieldUntil = time + 5000;
      this.nextAbilityAt = time + 8000;
      this.shieldAura.setPosition(this.ship.x, this.ship.y).setScale(0.35).setAlpha(0.12).setVisible(true);
      this.tweens.add({ targets: this.shieldAura, scale: 1.3, alpha: 0.24, duration: 360, yoyo: true, repeat: 1, ease: 'Sine.easeOut' });
      this.playAbilityBurst(this.ship.x, this.ship.y, 0x8affea, 1.7);
      this.time.delayedCall(5000, () => this.shieldAura.setVisible(false));
    } else {
      this.nextAbilityAt = time + 6000;
      const departureX = this.ship.x;
      const departureY = this.ship.y;
      this.playAbilityBurst(departureX, departureY, 0x55b4ff, 1.6);
      this.ship.x += Math.cos(this.ship.rotation) * 135;
      this.ship.y += Math.sin(this.ship.rotation) * 135;
      this.wrap(this.ship, this.scale.width, this.scale.height);
      this.playAbilityBurst(this.ship.x, this.ship.y, 0x8be7ff, 1.8);
      this.flashShip(0x8be7ff);
      this.invulnerableUntil = Math.max(this.invulnerableUntil, time + 3000);
      const body = this.ship.body as Phaser.Physics.Arcade.Body;
      body.velocity.x += Math.cos(this.ship.rotation) * 110;
      body.velocity.y += Math.sin(this.ship.rotation) * 110;
    }
    this.emitAbilityStatus(false, Math.ceil((this.nextAbilityAt - time) / 1000));
    window.dispatchEvent(new CustomEvent('orbit:ability-activated', { detail: { ship: this.shipId } }));
    this.emitStatus(`${loadout.ability} ATIVADO`);
  }

  private playAbilityBurst(x: number, y: number, color: number, scale = 2.5) {
    const ring = this.add.circle(x, y, 14, color, 0.12).setStrokeStyle(2, color, 0.95).setDepth(6).setScale(0.25);
    this.tweens.add({ targets: ring, scale, alpha: 0, duration: 430, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
    for (let index = 0; index < 10; index += 1) {
      const angle = Math.PI * 2 * index / 10;
      const distance = Phaser.Math.Between(25, 48);
      const spark = this.add.rectangle(x, y, 4, 4, color, 1).setBlendMode(Phaser.BlendModes.ADD).setDepth(6);
      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        alpha: 0,
        scale: 0.2,
        duration: Phaser.Math.Between(260, 420),
        ease: 'Cubic.easeOut',
        onComplete: () => spark.destroy(),
      });
    }
  }

  private flashShip(color: number) {
    this.ship.setTint(color);
    this.time.delayedCall(240, () => {
      if (this.ship.active) this.ship.clearTint();
    });
  }

  private hitRock = (bulletObject: Phaser.GameObjects.GameObject, rockObject: Phaser.GameObjects.GameObject) => {
    const bullet = bulletObject as Phaser.Physics.Arcade.Sprite;
    const rock = rockObject as Phaser.Physics.Arcade.Sprite;
    if (!bullet.active || !rock.active) return;
    bullet.disableBody(true, true);
    const tier = rock.getData('tier') as number;
    if (tier === 4) {
      const health = (rock.getData('health') as number) - 1;
      rock.setData('health', health).setTint(0xffc66d);
      this.time.delayedCall(90, () => { if (rock.active) rock.clearTint(); });
      window.dispatchEvent(new CustomEvent('orbit:boss-status', { detail: { visible: true, health, maxHealth: rock.getData('maxHealth') } }));
      window.dispatchEvent(new CustomEvent('orbit:sound', { detail: { sound: health === 0 ? 'bossDefeat' : 'hit' } }));
      if (health <= 0) {
        const x = rock.x;
        const y = rock.y;
        rock.disableBody(true, true);
        this.score += 1500;
        this.playAbilityBurst(x, y, 0xffc66d, 5);
        window.dispatchEvent(new CustomEvent('orbit:boss-status', { detail: { visible: false, health: 0, maxHealth: 1 } }));
        if (this.levelId === 'satellite-defense') this.emitSatelliteStatus();
        this.emitStatus('CHEFE DESTRUÍDO  +1500');
      } else {
        this.emitStatus(`CHEFE ATINGIDO · ${health} IMPACTOS RESTANTES`);
      }
      return;
    }
    const x = rock.x;
    const y = rock.y;
    const rockVelocity = (rock.body as Phaser.Physics.Arcade.Body).velocity.clone();
    rock.disableBody(true, true);
    const burstColor = tier === 3 ? 0xffc66d : 0x9be564;
    const shockRing = this.add.circle(x, y, 8, burstColor, 0.12).setStrokeStyle(2, burstColor, 0.9).setDepth(4).setScale(0.6);
    this.tweens.add({ targets: shockRing, scale: 3.2, alpha: 0, duration: 360, ease: 'Cubic.easeOut', onComplete: () => shockRing.destroy() });
    const sparkCount = tier === 3 ? 16 : 9;
    for (let index = 0; index < sparkCount; index += 1) {
      const angle = (Math.PI * 2 * index / sparkCount) + Phaser.Math.FloatBetween(-0.18, 0.18);
      const distance = Phaser.Math.Between(24, tier === 3 ? 68 : 42);
      const spark = this.add.circle(x, y, Phaser.Math.FloatBetween(1.3, 3), burstColor, 0.95).setBlendMode(Phaser.BlendModes.ADD).setDepth(4);
      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        alpha: 0,
        scale: 0.15,
        duration: Phaser.Math.Between(260, 470),
        ease: 'Cubic.easeOut',
        onComplete: () => spark.destroy(),
      });
    }
    this.score += tier === 3 ? 20 : tier === 2 ? 50 : 100;
    window.dispatchEvent(new CustomEvent('orbit:sound', { detail: { sound: 'explosion' } }));
    if (tier > 1) {
      this.addRock(x, y, tier - 1, new Phaser.Math.Vector2(-rockVelocity.y * 0.7, rockVelocity.x * 0.7));
      this.addRock(x, y, tier - 1, new Phaser.Math.Vector2(rockVelocity.y * 0.7, -rockVelocity.x * 0.7));
    }
    this.emitStatus(`ALVO DESTRUÍDO  +${tier === 3 ? 20 : tier === 2 ? 50 : 100}`);
  };

  private hitAlien = (bulletObject: Phaser.GameObjects.GameObject, alienObject: Phaser.GameObjects.GameObject) => {
    const bullet = bulletObject as Phaser.Physics.Arcade.Sprite;
    const alien = alienObject as Phaser.Physics.Arcade.Sprite;
    if (!bullet.active || !alien.active) return;
    bullet.disableBody(true, true);
    const x = alien.x;
    const y = alien.y;
    alien.disableBody(true, true);
    this.score += 350;
    window.dispatchEvent(new CustomEvent('orbit:sound', { detail: { sound: 'explosion' } }));

    const burst = this.add.circle(x, y, 12, 0xf2c75c, 0.22).setStrokeStyle(2, 0xffdf8c, 0.95).setDepth(4);
    this.tweens.add({ targets: burst, scale: 4, alpha: 0, duration: 440, ease: 'Cubic.easeOut', onComplete: () => burst.destroy() });
    for (let index = 0; index < 18; index += 1) {
      const angle = Math.PI * 2 * index / 18;
      const distance = Phaser.Math.Between(28, 76);
      const spark = this.add.rectangle(x, y, 4, 4, index % 2 ? 0x91d9d0 : 0xf48564, 1).setDepth(4);
      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        alpha: 0,
        duration: Phaser.Math.Between(300, 560),
        ease: 'Cubic.easeOut',
        onComplete: () => spark.destroy(),
      });
    }
    this.emitStatus('DISCO VOADOR DESTRUÍDO  +350');
  };

  private rockHitsSatellite = (rockObject: Phaser.GameObjects.GameObject, _collider: Phaser.GameObjects.GameObject) => {
    const rock = rockObject as Phaser.Physics.Arcade.Sprite;
    if (this.levelId !== 'satellite-defense' || !this.started || !rock.active || !this.satellite.visible || this.satelliteInvulnerableUntil > this.time.now) return;
    rock.disableBody(true, true);
    this.satelliteHealth = Math.max(0, this.satelliteHealth - 25);
    this.satelliteInvulnerableUntil = this.time.now + 450;
    this.satellite.setActive(this.satelliteHealth > 0).setVisible(this.satelliteHealth > 0);
    this.satellite.setTint(0xff7568);
    this.time.delayedCall(180, () => { if (this.satellite.active) this.satellite.clearTint(); });
    this.cameras.main.shake(180, 0.006);
    window.dispatchEvent(new CustomEvent('orbit:sound', { detail: { sound: 'damage' } }));
    this.emitSatelliteStatus();
    this.emitStatus(`SATÉLITE ATINGIDO · ${this.satelliteHealth}%`);
    if (this.satelliteHealth === 0) {
      this.satelliteCollider.setActive(false);
      (this.satelliteCollider.body as Phaser.Physics.Arcade.Body).enable = false;
      this.endGame('O SATÉLITE FOI DESTRUÍDO.');
    }
  };

  private shipHit = (_ship: Phaser.GameObjects.GameObject, rock: Phaser.GameObjects.GameObject) => {
    if (!this.ship.active || this.invulnerableUntil > this.time.now) return;
    const asteroid = rock as Phaser.Physics.Arcade.Sprite;
    if (!asteroid.active) return;
    if (this.shipId === 'bastion' && this.shieldUntil > this.time.now) {
      asteroid.disableBody(true, true);
      if (asteroid.getData('boss')) {
        window.dispatchEvent(new CustomEvent('orbit:boss-status', { detail: { visible: false, health: 0, maxHealth: 1 } }));
        if (this.levelId === 'satellite-defense') this.emitSatelliteStatus();
      }
      this.shieldUntil = 0;
      this.shieldAura.setVisible(false);
      this.emitStatus('CAMPO DE FORÇA ABSORVEU O IMPACTO');
      return;
    }
    this.lives -= 1;
    this.invulnerableUntil = this.time.now + 1900;
    this.ship.setPosition(this.scale.width / 2, this.scale.height / 2).setVelocity(0, 0).setRotation(-Math.PI / 2);
    this.cameras.main.shake(170, 0.009);
    window.dispatchEvent(new CustomEvent('orbit:sound', { detail: { sound: 'damage' } }));
    this.emitStatus('IMPACTO — CASCO COMPROMETIDO');
    if (this.lives <= 0) this.endGame();
  };

  private hitBossShot = (ship: Phaser.GameObjects.GameObject, shotObject: Phaser.GameObjects.GameObject) => {
    const shot = shotObject as Phaser.Physics.Arcade.Sprite;
    if (!shot.active) return;
    this.shipHit(ship, shot);
    shot.disableBody(true, true);
  };

  private endGame(reason = 'A estação ainda precisa de você.') {
    this.started = false;
    this.ship.disableBody(true, true);
    this.aliens.clear(true, true);
    this.enemyShots.clear(true, true);
    this.emitStatus('SINAL PERDIDO — FIM DE JOGO');
    const durationMs = this.time.now - this.runStartedAt;
    const durationSeconds = Math.floor(durationMs / 1000);
    const durationLabel = `${Math.floor(durationSeconds / 60)}:${String(durationSeconds % 60).padStart(2, '0')}`;
    window.dispatchEvent(new CustomEvent('orbit:run-ended', { detail: { score: this.score, wave: this.wave, durationMs } }));
    window.dispatchEvent(new CustomEvent('orbit:boss-status', { detail: { visible: false, health: 0, maxHealth: 1 } }));
    window.dispatchEvent(new CustomEvent('orbit:satellite-status', { detail: { active: false, health: this.satelliteHealth, maxHealth: 100 } }));
    window.dispatchEvent(new CustomEvent('orbit:overlay', { detail: {
      visible: true,
      title: 'FIM DE<br /><span>JOGO.</span>',
      copy: `Pontuação: <strong>${String(this.score).padStart(6, '0')}</strong><br />Onda ${String(this.wave).padStart(2, '0')} · Tempo ${durationLabel}<br />${reason}`,
      button: `TENTAR DE NOVO · ${SHIP_LOADOUTS[this.shipId].name.toUpperCase()}`,
      showLevels: true,
      showShips: true,
    } }));
  }

  private wrap(sprite: Phaser.Physics.Arcade.Sprite, width: number, height: number) {
    const margin = sprite.displayWidth / 2;
    if (sprite.x < -margin) sprite.x = width + margin;
    else if (sprite.x > width + margin) sprite.x = -margin;
    if (sprite.y < -margin) sprite.y = height + margin;
    else if (sprite.y > height + margin) sprite.y = -margin;
  }

  private emitStatus(state: string) {
    window.dispatchEvent(new CustomEvent('orbit:status', { detail: { score: this.score, lives: this.lives, wave: this.wave, state, durationMs: this.time.now - this.runStartedAt } }));
  }

  private emitMission(label: string, progress: number) {
    window.dispatchEvent(new CustomEvent('orbit:mission', { detail: { label, progress: Math.max(0, Math.min(1, progress)), type: this.missionType } }));
  }

  private emitSatelliteStatus() {
    window.dispatchEvent(new CustomEvent('orbit:satellite-status', { detail: { active: this.levelId === 'satellite-defense', health: this.satelliteHealth, maxHealth: 100 } }));
  }

  private emitAbilityStatus(ready: boolean, remaining: number) {
    this.lastAbilitySecondsRemaining = ready ? -1 : remaining;
    window.dispatchEvent(new CustomEvent('orbit:ability-status', { detail: { ready, label: SHIP_LOADOUTS[this.shipId].ability, remaining } }));
  }

  private cleanup() {
    window.removeEventListener('orbit:start', this.startGame);
    window.removeEventListener('orbit:toggle-pause', this.togglePause);
    window.removeEventListener('orbit:return-lobby', this.returnToLobby);
    window.removeEventListener('orbit:touch', this.handleTouch);
  }
}