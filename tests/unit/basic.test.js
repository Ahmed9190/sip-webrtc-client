describe('Basic Test Suite', () => {
    test('should pass basic test', () => {
        expect(1 + 1).toBe(2);
    });

    test('environment should be test', () => {
        expect(process.env.NODE_ENV).toBe('test');
    });
});
