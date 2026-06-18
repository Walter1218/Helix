const celsiusToFahrenheit = (celsius: number): number => celsius * 9 / 5 + 32

const fahrenheitToCelsius = (fahrenheit: number): number => (fahrenheit - 32) * 5 / 9

const celsius = 100
const fahrenheit = 212

console.log(`${celsius}°C = ${celsiusToFahrenheit(celsius)}°F`)
console.log(`${fahrenheit}°F = ${fahrenheitToCelsius(fahrenheit)}°C`)
