// Complete, independently runnable scripts using the local adapter.
export const CODE_EXAMPLES=[
 {category:'Basics',name:'Create a character',description:'Add an editable character at the origin.',code:`async function main(api) {
  await api.scene.addCharacter({ id: "hero", name: "Hero", position: { x: 0, y: 1, z: 0 } });
}`},
 {category:'Basics',name:'Two characters',description:'Place two individually editable characters.',code:`async function main(api) {
  await api.scene.addCharacter({ id: "hero", position: { x: -2, y: 1, z: 0 } });
  await api.scene.addCharacter({ id: "friend", position: { x: 2, y: 1, z: 0 } });
}`},
 {category:'Basics',name:'Block transforms',description:'Create a block and key its movement, rotation and scale.',code:`async function main(api) {
  const block = api.scene.addAsset("stone", { id: "block", position: { x: 0, y: 1, z: 0 } });
  api.timeline.key(block, { time: 2, position: { x: 2, y: 2, z: 0 }, rotation: { y: 90 }, scale: 1.5 });
}`},
 {category:'Character animations',name:'Walk and wave',description:'Bake a walk, then add an editable wave.',code:`async function main(api) {
  const hero = await api.scene.addCharacter({ id: "hero", position: { x: 0, y: 1, z: 0 } });
  api.timeline.preset(hero, "Walk", { time: 0, duration: 3, from: { x: 0, y: 1, z: 0 }, to: { x: 0, y: 1, z: 3 } });
  api.timeline.preset(hero, "Wave", { time: 3.2, duration: 2 });
}`},
 {category:'Camera',name:'Camera orbit and shot',description:'Set an orbit view and key a second camera shot.',code:`async function main(api) {
  api.camera.orbit({ target: { x: 0, y: 1, z: 0 }, azimuth: 45, elevation: 20, radius: 12 });
  api.timeline.keyCamera({ time: 4, position: { x: 4, y: 3, z: 6 }, target: { x: 0, y: 1, z: 0 }, fov: 40 });
}`},
 {category:'Environment',name:'Desert terrain',description:'Generate seeded desert terrain.',code:`async function main(api) {
  api.terrain.generate({ width: 16, depth: 16, biome: "desert", seed: 7 });
}`},
 {category:'Lighting',name:'Golden hour',description:'Set warm lighting and animate the sun.',code:`async function main(api) {
  api.lights.setEnvironment({ preset: "golden hour" });
  api.timeline.keySun({ time: 0, azimuth: -38, elevation: 42, intensity: 3 });
  api.timeline.keySun({ time: 8, azimuth: 120, elevation: 12, intensity: 1, color: "#ffb27a" });
}`},
 {category:'Custom meshes',name:'Simple sword',description:'Create an editable two-part mesh sword.',code:`async function main(api) {
  const sword = api.mesh.group("Sword")
    .box({ size: { x: 0.15, y: 1, z: 0.1 }, color: "#c8ccd4" })
    .box({ size: { x: 0.5, y: 0.1, z: 0.15 }, position: { y: -0.5 }, color: "#bd913e" });
  api.scene.addMesh(sword, { id: "sword", position: { x: 0, y: 2, z: 0 } });
}`},
 {category:'Advanced',name:'Character with sword',description:'Attach a custom sword to an editable character arm.',code:`async function main(api) {
  const hero = await api.scene.addCharacter({ id: "hero", position: { x: 0, y: 1, z: 0 } });
  const sword = api.scene.addMesh(api.mesh.group("Sword").box({ size: { x: 0.12, y: 1, z: 0.1 }, color: "#c8ccd4" }), { id: "sword" });
  api.scene.attach(sword, api.scene.get("hero:rightArm"));
  api.timeline.keyPose(hero, { time: 1, parts: { rightArm: { rotation: { x: -90 } } } });
}`}
];
