import {
  Color3,
  MeshBuilder,
  StandardMaterial,
  TransformNode,
  Vector3,
  type Mesh,
  type Scene,
} from "@babylonjs/core";

interface Projectile {
  mesh: Mesh;
  velocity: Vector3;
  age: number;
}

export interface GunnerAimState {
  firing: boolean;
  target: Vector3 | null;
}

export interface GunnerController {
  step(dt: number, ship: TransformNode | null, aim: GunnerAimState): void;
  dispose(): void;
}

const PROJECTILE_SPEED = 185;
const PROJECTILE_LIFE = 1.45;
const FIRE_INTERVAL = 0.11;
const MUZZLE_FORWARD = 7;
const MUZZLE_Y = -1.8;

export function createGunnerController(scene: Scene): GunnerController {
  const projectileMat = new StandardMaterial("gunner-projectile-mat", scene);
  projectileMat.emissiveColor = new Color3(0.45, 0.95, 1);
  projectileMat.diffuseColor = new Color3(0.2, 0.75, 1);
  projectileMat.specularColor = new Color3(0.9, 1, 1);

  const reticleMat = new StandardMaterial("gunner-reticle-mat", scene);
  reticleMat.emissiveColor = new Color3(1, 0.86, 0.22);
  reticleMat.diffuseColor = new Color3(1, 0.75, 0.12);
  reticleMat.specularColor = Color3.Black();

  const reticle = MeshBuilder.CreateTorus(
    "gunner-target-reticle",
    { diameter: 9, thickness: 0.45, tessellation: 48 },
    scene,
  );
  reticle.material = reticleMat;
  reticle.rotation.x = Math.PI / 2;
  reticle.isPickable = false;
  reticle.setEnabled(false);

  const projectiles: Projectile[] = [];
  let fireCooldown = 0;

  function fire(ship: TransformNode, target: Vector3) {
    const from = ship.position.clone();
    const flatTarget = target.clone();
    flatTarget.y = from.y + MUZZLE_Y;
    const dir = flatTarget.subtract(from);
    dir.y = 0;
    if (dir.lengthSquared() < 0.001) dir.z = 1;
    dir.normalize();

    const mesh = MeshBuilder.CreateSphere(
      "gunner-projectile",
      { diameter: 2.1, segments: 8 },
      scene,
    );
    mesh.material = projectileMat;
    mesh.isPickable = false;
    mesh.position.copyFrom(from.add(dir.scale(MUZZLE_FORWARD)));
    mesh.position.y = from.y + MUZZLE_Y;
    projectiles.push({
      mesh,
      velocity: dir.scale(PROJECTILE_SPEED),
      age: 0,
    });
  }

  function updateProjectiles(dt: number) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.age += dt;
      p.mesh.position.addInPlace(p.velocity.scale(dt));
      if (p.age >= PROJECTILE_LIFE) {
        p.mesh.dispose();
        projectiles.splice(i, 1);
      }
    }
  }

  return {
    step(dt, ship, aim) {
      updateProjectiles(dt);
      fireCooldown = Math.max(0, fireCooldown - dt);

      if (!aim.target) {
        reticle.setEnabled(false);
        return;
      }

      reticle.position.copyFrom(aim.target);
      reticle.setEnabled(true);

      if (!ship || !aim.firing || fireCooldown > 0) return;
      fire(ship, aim.target);
      fireCooldown = FIRE_INTERVAL;
    },
    dispose() {
      reticle.dispose();
      reticleMat.dispose();
      for (const p of projectiles) p.mesh.dispose();
      projectiles.length = 0;
      projectileMat.dispose();
    },
  };
}
