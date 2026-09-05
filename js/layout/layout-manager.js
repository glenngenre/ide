export function createLayoutManager({
    configuration,
    container,
    registerComponents,
    onInitialised,
}) {
    const layout = new GoldenLayout(
        configuration,
        container,
    );

    registerComponents(layout);
    layout.on("initialised", onInitialised);

    return {
        layout,
        init() {
            layout.init();
        },
        updateSize() {
            layout.updateSize();
        },
    };
}
